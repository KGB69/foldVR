import * as THREE from 'three';

/**
 * A very small helper wrapper around a rectangular plane used as a UI panel.
 * For now it is just a coloured quad; can later be replaced with HTML textures or Canvas.
 */
export class BasePanel {
  object3d: THREE.Mesh;
  private closeButton: THREE.Mesh;
  private hoverClose = false;
  // optional callback when close button pressed
  public onClose: () => void = () => this.hide();

  constructor(width = 1.2, height = 0.7, color = 0x333333) {
    const geom = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    this.object3d = new THREE.Mesh(geom, mat);
    // tilt slightly toward camera
    this.object3d.rotation.x = -0.2;

    /* --- close button --- */
    const btnSize = 0.12;
    const btnGeom = new THREE.PlaneGeometry(btnSize, btnSize);
    // draw "X" onto canvas
    const cvs = document.createElement('canvas');
    cvs.width = 64; cvs.height = 64;
    const ctx = cvs.getContext('2d')!;
    ctx.fillStyle = '#222'; ctx.fillRect(0,0,64,64);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(16,16); ctx.lineTo(48,48); ctx.moveTo(48,16); ctx.lineTo(16,48); ctx.stroke();
    const btnTex = new THREE.CanvasTexture(cvs);
    const btnMat = new THREE.MeshBasicMaterial({ map: btnTex, transparent: true });
    this.closeButton = new THREE.Mesh(btnGeom, btnMat);
    // position top-right (local space)
    this.closeButton.position.set(width/2 - btnSize/2 - 0.05, height/2 - btnSize/2 - 0.05, 0.02);
    this.closeButton.name = 'close';
    this.object3d.add(this.closeButton);
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

  /** Update hover state for close button each frame. */
  handlePointer(raycaster: THREE.Raycaster) {
    const its = raycaster.intersectObject(this.closeButton, false);
    // store hover state to be consumed on click
    this.hoverClose = its.length > 0;
    // simple visual feedback by slightly increasing opacity when hovered
    (this.closeButton.material as THREE.MeshBasicMaterial).opacity = this.hoverClose ? 1 : 0.8;
  }

  /** Should be called on controller/ mouse click. Returns true if the panel handled the click (i.e. close button). */
  select(): boolean {
    if (this.hoverClose) {
      this.onClose();
      return true;
    }
    return false;
  }
}
