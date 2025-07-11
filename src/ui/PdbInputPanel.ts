import * as THREE from 'three';
import { BasePanel } from './BasePanel';

/**
 * Simple on-screen keyboard panel for entering a 4-character PDB ID while in VR.
 * The panel shows a label with the current text and a grid of key buttons.
 * – Click letters / digits to append.
 * – "←" key deletes last char.
 * – "Load" key invokes onLoad callback with current id and hides the panel.
 */
export class PdbInputPanel extends BasePanel {
  private keys: THREE.Mesh[] = [];
  private hoverIndex = -1;
  private text = '';
  private labelSprite: THREE.Sprite;
  public onLoad: (id: string) => void = () => {};

  constructor(width = 1.0, rowH = 0.12) {
    super(width, rowH * 6 + 0.15, 0x333333);

    /* ----- label showing current text ----- */
    this.labelSprite = this.makeTextSprite('----', width - 0.1, rowH * 0.9);
    this.labelSprite.position.set(0, (rowH * 2.8), 0.01);
    this.object3d.add(this.labelSprite);

    /* ----- build keys ----- */
    const rows = [
      '1234567890',
      'QWERTYUIOP',
      'ASDFGHJKL',
      'ZXCVBNM',
      '←LOAD', // special row: backspace + load
    ];

    let y = rowH * 1.6;
    rows.forEach((chars, rIdx) => {
      const count = chars.length;
      for (let i = 0; i < count; i++) {
        const ch = chars[i];
        const isWide = ch === '←' || ch === 'L'; // backspace + L in LOAD may share bigger keys
        const keyW = isWide ? rowH * 1.4 : rowH * 1.0;
        const geom = new THREE.PlaneGeometry(keyW, rowH - 0.015);
        const mat = new THREE.MeshBasicMaterial({ color: 0x555555, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geom, mat);
        const xStart = -((count - 1) * (rowH)) / 2;
        const x = xStart + i * rowH;
        mesh.position.set(x, y, 0.01);
        mesh.userData.char = ch;
        this.object3d.add(mesh);
        this.keys.push(mesh);

        // text sprite
        const sprite = this.makeTextSprite(ch, rowH * 0.8, rowH * 0.8);
        sprite.position.copy(mesh.position);
        this.object3d.add(sprite);
      }
      y -= rowH;
    });
  }

  /* ------------ interaction ------------ */
  handlePointer(raycaster: THREE.Raycaster) {
    super.handlePointer(raycaster);
    const its = raycaster.intersectObjects(this.keys, false);
    if (its.length) {
      const idx = this.keys.indexOf(its[0].object as THREE.Mesh);
      this.setHover(idx);
    } else {
      this.setHover(-1);
    }
  }

  select(): boolean {
    // close button?
    if (super.select()) return true;

    if (this.hoverIndex === -1) return false;
    const key = this.keys[this.hoverIndex];
    const ch: string = key.userData.char;

    if (ch === '←') {
      // backspace
      this.text = this.text.slice(0, -1);
    } else if (ch === 'L') {
      // part of "LOAD" — treat any of its letters as load confirmation
      if (this.text.length) {
        this.hide();
        this.onLoad(this.text);
      }
    } else {
      if (this.text.length < 4) this.text += ch;
    }
    this.updateLabel();
    return true;
  }

  /* ------------ helpers ------------ */
  private setHover(idx: number) {
    if (this.hoverIndex === idx) return;
    if (this.hoverIndex !== -1) {
      (this.keys[this.hoverIndex].material as THREE.MeshBasicMaterial).color.set(0x555555);
    }
    this.hoverIndex = idx;
    if (this.hoverIndex !== -1) {
      (this.keys[this.hoverIndex].material as THREE.MeshBasicMaterial).color.set(0x888888);
    }
  }

  private updateLabel() {
    const txt = this.text.padEnd(4, '-');
    const canvas = (this.labelSprite.material as THREE.SpriteMaterial).map!.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, canvas.width / 2, canvas.height / 2);
    (this.labelSprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
  }

  private makeTextSprite(text: string, w: number, h: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(w, h, 1);
    return sprite;
  }
}
