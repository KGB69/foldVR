import * as THREE from 'three';

export interface Atom {
  x: number;
  y: number;
  z: number;
  element: string;
}

const ELEMENT_COLORS: Record<string, number> = {
  H: 0xffffff,
  C: 0xaaaaaa,
  N: 0x0000ff,
  O: 0xff0000,
  S: 0xffff00,
  P: 0xff8000,
};

export function parsePDB(text: string): Atom[] {
  const atoms: Atom[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const x = parseFloat(line.substr(30, 8));
      const y = parseFloat(line.substr(38, 8));
      const z = parseFloat(line.substr(46, 8));
      let element = line.substr(76, 2).trim();
      if (!element) {
        // fallback to column 12-16 (atom name)
        element = line.substr(12, 2).trim();
      }
      atoms.push({ x, y, z, element });
    }
  }
  return atoms;
}

export function createBallStick(atoms: Atom[]): THREE.Group {
  const group = new THREE.Group();
  const sphereGeom = new THREE.SphereGeometry(0.3, 12, 12);
  const cylGeom = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
  const matCache = new Map<number, THREE.MeshStandardMaterial>();

  // spheres (reuse materials)
  for (const atom of atoms) {
    const colorVal = ELEMENT_COLORS[atom.element] ?? 0x888888;
    let mat = matCache.get(colorVal);
    if (!mat) {
      const newMat = new THREE.MeshStandardMaterial({ color: colorVal });
      matCache.set(colorVal, newMat);
      mat = newMat;
    }
    const sphere = new THREE.Mesh(sphereGeom, mat);
    sphere.position.set(atom.x, atom.y, atom.z);
    group.add(sphere);
  }

  // Skip expensive bond creation for large structures (>2000 atoms)
  if (atoms.length < 2000) {
    const bondMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      for (let j = i + 1; j < atoms.length; j++) {
        const b = atoms[j];
        const dist2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
        if (dist2 < 1.8 ** 2) {
          const dist = Math.sqrt(dist2);
          const cyl = new THREE.Mesh(cylGeom, bondMat);
          const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
          cyl.position.copy(mid);
          cyl.scale.set(1, dist, 1);
          cyl.lookAt(b.x, b.y, b.z);
          cyl.rotateX(Math.PI / 2);
          group.add(cyl);
        }
      }
    }
  }
  return group;
}

export function createSpaceFill(atoms: Atom[]): THREE.Group {
  const group = new THREE.Group();
  const radiusTable: Record<string, number> = { H: 0.5, C: 0.77, N: 0.75, O: 0.73, S: 1.02, P: 1.06 };
  for (const atom of atoms) {
    const radius = radiusTable[atom.element] ?? 0.8;
    const geom = new THREE.SphereGeometry(radius, 16, 16);
    const color = ELEMENT_COLORS[atom.element] ?? 0x888888;
    const mat = new THREE.MeshStandardMaterial({ color });
    const sphere = new THREE.Mesh(geom, mat);
    sphere.position.set(atom.x, atom.y, atom.z);
    group.add(sphere);
  }
  return group;
}

export async function loadPDB(id: string): Promise<{ atoms: Atom[]; group: THREE.Group }> {
  const url = `https://files.rcsb.org/download/${id.toUpperCase()}.pdb`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDB ${id}`);
  const text = await res.text();
  const atoms = parsePDB(text);
  // scale down to nanometers (~10x) for scene units
  for (const atom of atoms) {
    atom.x /= 10;
    atom.y /= 10;
    atom.z /= 10;
  }
  let group: THREE.Group;
  // Use a lightweight wireframe representation for very large structures
  if (atoms.length > 3000) {
    group = createWireframe(atoms);
  } else {
    group = createBallStick(atoms);
  }
  // Centering & placement handled by ConfinedSpaceXR.loadPdbId
  return { atoms, group };
}

// ---------------- Additional representations ----------------
export function createWireframe(atoms: Atom[]): THREE.Group {
  const group = new THREE.Group();
  const sphereGeom = new THREE.SphereGeometry(0.3, 8, 8);
  const matCache = new Map<number, THREE.MeshBasicMaterial>();
  for (const atom of atoms) {
    const colorVal = ELEMENT_COLORS[atom.element] ?? 0x888888;
    let mat = matCache.get(colorVal);
    if (!mat) {
      const newMat = new THREE.MeshBasicMaterial({ color: colorVal, wireframe: true });
      matCache.set(colorVal, newMat);
      mat = newMat;
    }
    const sphere = new THREE.Mesh(sphereGeom, mat);
    sphere.position.set(atom.x, atom.y, atom.z);
    group.add(sphere);
  }
  return group;
}

export function createTransparentSurface(atoms: Atom[]): THREE.Group {
  if (atoms.length > 2000) {
    // fallback to wireframe for large structures to avoid GPU overload
    return createWireframe(atoms);
  }
  const group = createSpaceFill(atoms);
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = 0.4;
    }
  });
  return group;
}
