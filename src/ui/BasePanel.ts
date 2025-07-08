import * as THREE from 'three';

/**
 * A very small helper wrapper around a rectangular plane used as a UI panel.
 * For now it is just a coloured quad; can later be replaced with HTML textures or Canvas.
 */
export class BasePanel {
  object3d: THREE.Mesh;

  constructor(width = 1.2, height = 0.7, color = 0x333333) {
    const geom = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    this.object3d = new THREE.Mesh(geom, mat);
    // tilt slightly toward camera
    this.object3d.rotation.x = -0.2;
  }

  show() {
    this.object3d.visible = true;
  }

  hide() {
    this.object3d.visible = false;
  }

  toggle() {
    this.object3d.visible = !this.object3d.visible;
  }
}
