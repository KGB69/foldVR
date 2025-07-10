import * as THREE from 'three';

type MenuItem = {
  label: string;
  action: () => void;
};

export class RadialMenu {
  object3d: THREE.Group;
  private items: MenuItem[] = [];
  private hoverIndex = -1;
  private sprites: THREE.Sprite[] = [];
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

      // label sprite
      const mid = i * segAngle + segAngle / 2;
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.items[i].label, canvas.width / 2, canvas.height / 2);
      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);
      const dist = radius * 0.55;
      sprite.position.set(Math.sin(mid) * dist, 0.001, Math.cos(mid) * dist); // slight offset to avoid z-fight
      const scale = 0.25;
      sprite.scale.set(scale, scale * 0.5, 1);
      sprite.renderOrder = 1000;
      this.object3d.add(sprite);
      this.sprites.push(sprite);
    }
  }

  update(_delta: number) {
    // no spin; leave static – facing is handled by parent/lookAt.
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

  public setHover(index: number) {
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

  setOpacity(op: number) {
    op = THREE.MathUtils.clamp(op, 0, 1);
    for (const wedge of this.wedges) {
      const mat = wedge.material as THREE.MeshBasicMaterial;
      mat.transparent = op < 1;
      mat.opacity = op;
    }
    for (const spr of this.sprites) {
      const mat = spr.material as THREE.SpriteMaterial;
      mat.transparent = op < 1;
      mat.opacity = op;
    }
  }

  getItemCount() {
    return this.items.length;
  }

  select() {
    if (this.hoverIndex !== -1) {
      const item = this.items[this.hoverIndex];
      item.action();
    }
  }
}
