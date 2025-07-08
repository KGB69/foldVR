import * as THREE from 'three';
import { BasePanel } from './BasePanel';

/**
 * TextPanel – simple utility that draws an array of text lines onto a
 * CanvasTexture and applies it to the underlying BasePanel mesh.
 * Non-interactive for now – purely informational.
 */
export class TextPanel extends BasePanel {
  constructor(lines: string[], width = 1.2, height = 0.7) {
    super(width, height, 0xffffff);

    // build canvas
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // background
    ctx.fillStyle = '#222';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    // text
    ctx.fillStyle = '#fff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lineHeight = 28;
    lines.forEach((line, i) => {
      ctx.fillText(line, 16, 16 + i * lineHeight);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const mat = this.object3d.material as THREE.MeshBasicMaterial;
    mat.color.set(0xffffff);
    mat.map = texture;
    mat.needsUpdate = true;
  }
}
