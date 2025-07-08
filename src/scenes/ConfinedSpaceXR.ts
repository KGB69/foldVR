import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { RadialMenu } from '../ui/RadialMenu';
import { BasePanel } from '../ui/BasePanel';

export class ConfinedSpaceXR {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private orbit!: OrbitControls;
  private walk!: PointerLockControls;
  private useOrbit = true;
  private menu!: RadialMenu;
  private clock = new THREE.Clock();

  // panels
  private helpPanel!: BasePanel;
  private settingsPanel!: BasePanel;
  private visPanel!: BasePanel;

  // pointer interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x222222, 10, 50);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 1.6, 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);
    document.body.appendChild(VRButton.createButton(this.renderer));

    // controls
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.walk = new PointerLockControls(this.camera, document.body);

    window.addEventListener('keydown', (e) => {
      if (e.key === 't') {
        this.toggleControls();
      }
    });

    // pointer events
    this.renderer.domElement.addEventListener('pointermove', (ev) => {
      this.mouse.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
    });
    this.renderer.domElement.addEventListener('click', () => {
      this.menu.select();
    });

    // simple env
    const light = new THREE.HemisphereLight(0xffffff, 0x444444);
    light.position.set(0, 20, 0);
    this.scene.add(light);
    const floor = new THREE.GridHelper(20, 20, 0x444444, 0x444444);
    this.scene.add(floor);

    // pedestal placeholder
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x993333 })
    );
    pedestal.position.y = 0.1;
    this.scene.add(pedestal);

    // menu
    this.menu = new RadialMenu();
    this.scene.add(this.menu.object3d);

    // panels (initially hidden)
    this.helpPanel = new BasePanel();
    this.helpPanel.object3d.position.set(0, 1.6, -1.5);
    this.helpPanel.hide();
    this.scene.add(this.helpPanel.object3d);

    this.settingsPanel = new BasePanel(undefined, undefined, 0x224466);
    this.settingsPanel.object3d.position.set(0, 1.6, -1.5);
    this.settingsPanel.hide();
    this.scene.add(this.settingsPanel.object3d);

    this.visPanel = new BasePanel(undefined, undefined, 0x662244);
    this.visPanel.object3d.position.set(0, 1.6, -1.5);
    this.visPanel.hide();
    this.scene.add(this.visPanel.object3d);

    // link menu actions
    this.menu.setAction('Help', () => this.togglePanel(this.helpPanel));
    this.menu.setAction('Settings', () => this.togglePanel(this.settingsPanel));
    this.menu.setAction('Visuals', () => this.togglePanel(this.visPanel));

    // animate
    this.renderer.setAnimationLoop(() => this.animate());

    window.addEventListener('resize', () => this.onResize());
  }

  private toggleControls() {
    this.useOrbit = !this.useOrbit;
    if (this.useOrbit) {
      this.walk.unlock();
    } else {
      this.walk.lock();
    }
  }

  private togglePanel(panel: BasePanel) {
    const willOpen = !panel.object3d.visible;
    // hide all panels first
    this.helpPanel.hide();
    this.settingsPanel.hide();
    this.visPanel.hide();
    // show the desired one if it was closed
    if (willOpen) panel.show();
  }

  private animate() {
    const delta = this.clock.getDelta();
    this.menu.update(delta);

    // hover detection
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.menu.handlePointer(this.raycaster);

    if (!this.useOrbit) {
      // placeholder for future WASD processing
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
