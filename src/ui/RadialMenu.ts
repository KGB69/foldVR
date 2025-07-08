import * as THREE from 'three';

type MenuItem = {
  label: string;
  action: () => void;
};

export class RadialMenu {
  object3d: THREE.Group;
  private items: MenuItem[] = [];
  private hoverIndex = -1;
  private wedges: THREE.Mesh[] = [];

  constructor() {
    this.object3d = new THREE.Group();
    this.object3d.position.set(0, 1.4, 0);

    this.addItem('Help', () => console.log('Help clicked'));
    this.addItem('Settings', () => console.log('Settings clicked'));
    this.addItem('Load', () => console.log('Load clicked'));
    this.addItem('Visuals', () => console.log('Visuals clicked'));

    this.buildMesh();
  }

  addItem(label: string, action: () => void) {
    this.items.push({ label, action });
  }

  setAction(label: string, action: () => void) {
    const item = this.items.find((it) => it.label === label);
    if (item) item.action = action;
  }

  private buildMesh() {
    const radius = 0.5;
    const segAngle = (2 * Math.PI) / this.items.length;
    for (let i = 0; i < this.items.length; i++) {
      const geom = new THREE.RingGeometry(radius * 0.7, radius, 32, 1, i * segAngle, segAngle);
      const mat = new THREE.MeshBasicMaterial({ color: 0x2266aa, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
      const wedge = new THREE.Mesh(geom, mat);
      wedge.renderOrder = 999;
      wedge.userData.index = i;
      this.wedges.push(wedge);
      this.object3d.add(wedge);
    }
  }

  update(_delta: number) {
    this.object3d.rotation.y += 0.3 * _delta; // slow spin for now
  }

  /**
   * Update hover based on raycaster.
   */
  handlePointer(raycaster: THREE.Raycaster) {
    const intersects = raycaster.intersectObjects(this.wedges, false);
    if (intersects.length) {
      const idx = intersects[0].object.userData.index as number;
      this.setHover(idx);
    } else {
      this.setHover(-1);
    }
  }

  private setHover(index: number) {
    if (this.hoverIndex === index) return;
    // reset previous
    if (this.hoverIndex !== -1) {
      (this.wedges[this.hoverIndex].material as THREE.MeshBasicMaterial).color.set(0x2266aa);
    }
    this.hoverIndex = index;
    if (this.hoverIndex !== -1) {
      (this.wedges[this.hoverIndex].material as THREE.MeshBasicMaterial).color.set(0xffaa00);
    }
  }

  select() {
    if (this.hoverIndex !== -1) {
      const item = this.items[this.hoverIndex];
      item.action();
    }
  }
}
