import * as THREE from 'three';
import { BasePanel } from './BasePanel';

export class QuickLoadPanel extends BasePanel {
  private entries: string[];
  private buttons: THREE.Mesh[] = [];
  private hoverIndex = -1;
  onSelect: (id: string) => void = () => {};

  constructor(ids: string[], width = 0.8, rowHeight = 0.12) {
    super(width, ids.length * rowHeight + 0.1, 0x003355);
    this.entries = ids;

    const yStart = (ids.length - 1) * rowHeight * 0.5;

    ids.forEach((id, i) => {
      // button plane
      const geom = new THREE.PlaneGeometry(width - 0.1, rowHeight - 0.02);
      const mat = new THREE.MeshBasicMaterial({ color: 0x225577, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(0, yStart - i * rowHeight, 0.01); // slightly in front
      mesh.userData.index = i;
      this.object3d.add(mesh);
      this.buttons.push(mesh);

      // text sprite
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.font = '32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(id, canvas.width / 2, canvas.height / 2);
      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      const s = (rowHeight * 0.8);
      sprite.scale.set(s * 2, s, 1);
      sprite.position.copy(mesh.position);
      this.object3d.add(sprite);
    });
  }

  handlePointer(raycaster: THREE.Raycaster) {
    const intersects = raycaster.intersectObjects(this.buttons, false);
    if (intersects.length) {
      const idx = intersects[0].object.userData.index as number;
      this.setHover(idx);
    } else {
      this.setHover(-1);
    }
  }

  private setHover(idx: number) {
    if (this.hoverIndex === idx) return;
    if (this.hoverIndex !== -1) {
      (this.buttons[this.hoverIndex].material as THREE.MeshBasicMaterial).color.set(0x225577);
    }
    this.hoverIndex = idx;
    if (this.hoverIndex !== -1) {
      (this.buttons[this.hoverIndex].material as THREE.MeshBasicMaterial).color.set(0x4488aa);
    }
  }

  select() {
    if (this.hoverIndex !== -1) {
      const id = this.entries[this.hoverIndex];
      this.onSelect(id);
    }
  }
}
