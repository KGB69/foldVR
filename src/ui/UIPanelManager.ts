import * as THREE from 'three';
import { BasePanel } from './BasePanel';
import { TextPanel } from './TextPanel';
import { QuickLoadPanel } from './QuickLoadPanel';
import { PdbInputPanel } from './PdbInputPanel';

export type PanelId = 'help' | 'settings' | 'visuals' | 'quickLoad' | 'pdbInput';

/**
 * Centralised helper that owns all overlay UI panels (help, settings, visuals, quick-load).
 * – Keeps the panel meshes in the scene graph.
 * – Handles show / hide logic so that only one panel is visible at a time.
 * – Re-positions any visible panel every frame to stay in front of the headset.
 */
export class UIPanelManager {
  private camera: THREE.Camera;
  private scene: THREE.Scene;

  private helpPanel: TextPanel;
  private settingsPanel: TextPanel;
  private visPanel: TextPanel;
  private quickLoad: QuickLoadPanel;
  private pdbInput: PdbInputPanel;

  // expose quick-load select externally
  public onQuickLoadSelect: (id: string) => void = () => {};

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.camera = camera;
    this.scene = scene;

    /* ------------ build panels ------------ */
    this.helpPanel = new TextPanel([
      'WebXR Molecule Viewer',
      '',
      'Left Controller:',
      '  • Thumb-stick  – highlight wrist menu',
      '  • Grip         – show/hide wrist menu',
      '',
      'Right Controller:',
      '  • Trigger tap  – select',
      '  • Trigger hold – context menu',
      '',
      'Radial Menu items:',
      '  Help, Settings, Visuals, Load',
    ]);

    this.settingsPanel = new TextPanel([
      'Settings',
      '',
      'Locomotion:',
      '  T  – toggle Orbit / Walk (desktop only)',
      '',
      'Coming soon:',
      '  • Colour presets',
      '  • Molecule auto-scale',
    ]);

    this.visPanel = new TextPanel([
      'Visual Styles',
      '',
      '1  Ball-and-Stick',
      '2  Space-Filling',
      '3  Wireframe',
      '4  Transparent Surface',
      '5  Ribbon/Cartoon',
      '',
      'Click Visuals on menu to cycle',
    ]);

    // Pre-curated small-ish proteins to avoid heavy GPU load
    this.quickLoad = new QuickLoadPanel(['1CRN', '1UBQ', '2PTL', '1STP', '2F4B']);
    this.quickLoad.onSelect = (id: string) => this.onQuickLoadSelect(id);

    // Larger width & row height for better VR legibility
    this.pdbInput = new PdbInputPanel(1.2, 0.15);
    this.pdbInput.onLoad = (id: string) => this.onQuickLoadSelect(id);

    // add to scene & hide by default
    [this.helpPanel, this.settingsPanel, this.visPanel, this.quickLoad, this.pdbInput].forEach(p => {
      p.hide();
      this.scene.add(p.object3d);
    });
  }

  /** Hide all panels then toggle the requested one. Returns true if panel is now open. */
  toggle(id: PanelId): boolean {
    const panel = this.getPanel(id);
    const willOpen = !panel.object3d.visible;

    // hide all
    [this.helpPanel, this.settingsPanel, this.visPanel, this.quickLoad, this.pdbInput].forEach(p => p.hide());

    if (willOpen) {
      this.placePanel(panel);
      panel.show();
    }
    return willOpen;
  }

  /** Call once per frame to keep any visible panel in front of the user. */
  update() {
    [this.helpPanel, this.settingsPanel, this.visPanel, this.quickLoad, this.pdbInput].forEach(p => {
      if (p.object3d.visible) this.placePanel(p);
    });
  }

  /** Forward pointer ray to whichever panel is visible (for close btn & hover). */
  handlePointer(raycaster: THREE.Raycaster) {
    [this.helpPanel, this.settingsPanel, this.visPanel, this.quickLoad, this.pdbInput].forEach(p => {
      if (p.object3d.visible && (p as any).handlePointer) {
        (p as any).handlePointer(raycaster);
      }
    });
  }

  /** Called on controller select to let any open panel react (e.g., close). Returns true if a panel handled the click. */
  handleSelect(): boolean {
    let consumed = false;
    [this.helpPanel, this.settingsPanel, this.visPanel, this.quickLoad, this.pdbInput].forEach(p => {
      if (p.object3d.visible && (p as any).select) {
        const res = (p as any).select();
        consumed = consumed || !!res;
      }
    });
    return consumed;
  }

  getQuickLoadPanel(): QuickLoadPanel {
    return this.quickLoad;
  }

  getPdbInputPanel(): PdbInputPanel {
    return this.pdbInput;
  }

  /* -------------------- internals -------------------- */
  private getPanel(id: PanelId): BasePanel {
    switch (id) {
      case 'help': return this.helpPanel;
      case 'settings': return this.settingsPanel;
      case 'visuals': return this.visPanel;
      case 'quickLoad': return this.quickLoad;
      case 'pdbInput': return this.pdbInput;
    }
  }

  /** Position panel a fixed distance in front of the camera. */
  private placePanel(panel: BasePanel) {
    const distance = 1.0;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
    panel.object3d.position.copy(pos);
    panel.object3d.lookAt(this.camera.position);
  }
}
