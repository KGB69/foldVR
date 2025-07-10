import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';
import { RadialMenu } from '../ui/RadialMenu';
import { BasePanel } from '../ui/BasePanel';
import { TextPanel } from '../ui/TextPanel';
import { QuickLoadPanel } from '../ui/QuickLoadPanel';
import { loadPDB, Atom, createBallStick, createSpaceFill, createWireframe, createTransparentSurface } from '../molecule/PDBLoader';
import { LoadOverlay } from '../ui/LoadOverlay';

export class ConfinedSpaceXR {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private orbit!: OrbitControls;
  private walk!: PointerLockControls;
  private useOrbit = true;
  private menu!: RadialMenu;
  private clock = new THREE.Clock();
  private menuVisible = true;
  private loadOverlay!: LoadOverlay;

  // panels
  private helpPanel!: BasePanel;
  private settingsPanel!: BasePanel;
  private visPanel!: BasePanel;
  private quickLoad!: QuickLoadPanel;
  private moleculeGroup?: THREE.Group;
  private atoms?: Atom[];
  private repIndex = 0;
  // TODO queue (polish) -----------------------------------------------------
  // 1. Re-measure bounding box after each representation switch to keep
  //    scale consistent across modes.
  // 2. Transparent-surface representation currently occludes radial menu;
  //    set depthWrite = false and an appropriate renderOrder.
  // ------------------------------------------------------------------------
  private repBuilders = [createBallStick, createSpaceFill, createWireframe, createTransparentSurface];
  private moleculeScale = 1;
  private transitionOld?: THREE.Group;
  private transitionNew?: THREE.Group;
  private transitionProgress = 0;

  // pointer interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  // vr controllers
  private controllers: THREE.Group[] = [];
  private vrSpeed = 5; // meters per second
  private debugTimer = 0;
  private userRig!: THREE.Group;

  // movement keys
  private keys = { forward: false, back: false, left: false, right: false };

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

    // user rig to allow locomotion in XR
    this.userRig = new THREE.Group();
    this.userRig.add(this.camera);
    this.scene.add(this.userRig);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;

    this.setupControllers();
    document.body.appendChild(this.renderer.domElement);
    document.body.appendChild(VRButton.createButton(this.renderer));

    // controls
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.walk = new PointerLockControls(this.camera, document.body);

    window.addEventListener('keydown', (e) => {
      if (e.key === 't') {
        this.toggleControls();
      }
      switch (e.code) {
        case 'KeyW':
          this.keys.forward = true;
          break;
        case 'KeyS':
          this.keys.back = true;
          break;
        case 'KeyA':
          this.keys.left = true;
          break;
        case 'KeyD':
          this.keys.right = true;
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
          this.keys.forward = false;
          break;
        case 'KeyS':
          this.keys.back = false;
          break;
        case 'KeyA':
          this.keys.left = false;
          break;
        case 'KeyD':
          this.keys.right = false;
          break;
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
    this.helpPanel = new TextPanel([
      'WebXR Molecule Viewer',
      '',
      'M  : toggle radial menu',
      'T  : toggle orbit/walk',
      'WASD: move (walk mode)',
      'Mouse click: select menu item',
      '',
      'Use the Load menu to fetch a PDB',
      'Use Visuals to change style',
    ]);
    this.helpPanel.object3d.position.set(0, 1.6, -1.5);
    this.helpPanel.hide();
    this.scene.add(this.helpPanel.object3d);

    this.settingsPanel = new TextPanel([
      'Settings (coming soon)',
      '',
      '- Orbit vs Walk: press T',
      '- Menu opacity and scale TBD',
    ]);
    this.settingsPanel.object3d.position.set(0, 1.6, -1.5);
    this.settingsPanel.hide();
    this.scene.add(this.settingsPanel.object3d);

    this.visPanel = new TextPanel([
      'Visual Styles',
      '',
      '1  Ball-and-Stick',
      '2  Space-Filling',
      '3  Wireframe',
      '4  Transparent Surface',
      '',
      'Click Visuals on menu to cycle',
    ]);
    this.visPanel.object3d.position.set(0, 1.6, -1.5);
    this.visPanel.hide();
    this.scene.add(this.visPanel.object3d);

    // quick load panel with preset PDB IDs
    this.quickLoad = new QuickLoadPanel(['1CRN','2POR','5PTI','4HHB','1A4W']);
    this.quickLoad.hide();
    this.quickLoad.onSelect = (id:string)=>{ this.loadPdbId(id); this.quickLoad.hide(); };
    this.scene.add(this.quickLoad.object3d);

    // HTML overlay for molecule loading
    this.loadOverlay = new LoadOverlay();
    this.loadOverlay.onLoad = (id) => this.loadPdbId(id);

    // keyboard toggle for menu visibility
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleMenu();
    });

    // link menu actions
    this.menu.setAction('Help', () => this.togglePanel(this.helpPanel));
    this.menu.setAction('Settings', () => this.togglePanel(this.settingsPanel));
    this.menu.setAction('Visuals', () => this.cycleRepresentation());
    this.menu.setAction('Load', () => {
      if (this.renderer.xr.isPresenting) {
        this.togglePanel(this.quickLoad);
      } else {
        this.loadOverlay.show();
      }
    });

    // animate
    this.renderer.setAnimationLoop(() => this.animate());

    window.addEventListener('resize', () => this.onResize());
  }

  private toggleControls() {
    this.useOrbit = !this.useOrbit;
    this.orbit.enabled = this.useOrbit;
    if (this.useOrbit) {
      this.walk.unlock();
    } else {
      // request pointer lock (requires user gesture; 'T' key press counts)
      this.walk.lock();
    }

  }

  private async loadPdbId(pdb: string) {
    // TODO: validate input
    try {
      const { atoms, group } = await loadPDB(pdb.trim());
      if (this.moleculeGroup) this.scene.remove(this.moleculeGroup);
      this.moleculeGroup = group;
      this.atoms = atoms;
      this.repIndex = 0;
      group.position.set(0, 1, 0); // atop pedestal
      // auto-fit height to ~1 unit
      const bbox = new THREE.Box3().setFromObject(group);
      const height = bbox.max.y - bbox.min.y;
      this.moleculeScale = height > 0 ? 1 / height : 1;
      group.scale.set(this.moleculeScale, this.moleculeScale, this.moleculeScale);
      this.scene.add(group);
      console.log(`Loaded ${pdb}`);
    } catch (err) {
      console.error(err);
      console.warn('Failed to load PDB');
    }
  }

  private cycleRepresentation() {
    if (!this.atoms) {
      console.warn('Load a molecule first');
      return;
    }
    this.repIndex = (this.repIndex + 1) % this.repBuilders.length;
    // set up smooth transition
    const builder = this.repBuilders[this.repIndex];
    const newGroup = builder(this.atoms);
    newGroup.position.set(0, 1, 0);
    newGroup.scale.set(0.01 * this.moleculeScale, 0.01 * this.moleculeScale, 0.01 * this.moleculeScale);
    this.scene.add(newGroup);
    this.transitionOld = this.moleculeGroup;
    this.transitionNew = newGroup;
    this.transitionProgress = 0;
    this.moleculeGroup = newGroup;
  }

  private placePanel(panel: BasePanel) {
    // position panel a fixed distance in front of camera, facing the camera
    const distance = 1.5;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
    panel.object3d.position.copy(pos);
    panel.object3d.lookAt(this.camera.position);

  }

  private togglePanel(panel: BasePanel) {
  const isQuick = panel === this.quickLoad;
    const willOpen = !panel.object3d.visible;
    // hide all panels first
    this.helpPanel.hide();
    this.settingsPanel.hide();
    this.visPanel.hide();
    if (this.quickLoad) this.quickLoad.hide();
    // show the desired one if it was closed
    if (willOpen) {
    // if opening quick load, hide the radial menu so it doesn't block pointer
    if (isQuick) {
      this.menuVisible = false;
      this.menu.object3d.visible = false;
    }
      this.placePanel(panel);
      panel.show();
  } else {
    // if closing quick load, restore the radial menu visibility that we hid when opening it
    if (isQuick) {
      this.menuVisible = true;
      this.menu.object3d.visible = true;
    }
  }
}

  private toggleMenu() {
    this.menuVisible = !this.menuVisible;
    this.menu.object3d.visible = this.menuVisible;
  }

  private setupControllers() {
    const controllerModelFactory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener('selectstart', () => {
        if (this.quickLoad.object3d.visible) {
          // perform selection and then restore radial menu visibility
          this.quickLoad.select();
          this.menuVisible = true;
          this.menu.object3d.visible = true;
        } else if (this.menuVisible) {
          this.menu.select();
        }
        // haptic pulse
        const input = (controller as any).inputSource as XRInputSource | undefined;
        const gamepad = input?.gamepad;
        const haptic = gamepad?.hapticActuators?.[0];
        haptic?.pulse?.(0.5, 100);
      });
      controller.addEventListener('connected', (event: any) => {
        controller.userData.inputSource = event.data;
      });
      controller.addEventListener('disconnected', () => {
        delete controller.userData.inputSource;
      });
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffff00 }));
      line.name = 'ray';
      line.scale.z = 5;
      controller.add(line);
      this.userRig.add(controller);

      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(controllerModelFactory.createControllerModel(grip));
      this.userRig.add(grip);

      this.controllers.push(controller);
    }
  }

  private animate() {
    const delta = this.clock.getDelta();
    // update orbit controls if enabled
    if (this.useOrbit) this.orbit.update();

    if (this.menuVisible) this.menu.update(delta);

  // handle representation transition
  if (this.transitionNew) {
    const DURATION = 0.5;
    this.transitionProgress += delta;
    const t = Math.min(this.transitionProgress / DURATION, 1);
    const scaleIn = THREE.MathUtils.lerp(0.01 * this.moleculeScale, this.moleculeScale, t);
    const scaleOut = THREE.MathUtils.lerp(this.moleculeScale, 0.01 * this.moleculeScale, t);
    this.transitionNew.scale.set(scaleIn, scaleIn, scaleIn);
    if (this.transitionOld) this.transitionOld.scale.set(scaleOut, scaleOut, scaleOut);
    if (t >= 1) {
      if (this.transitionOld) {
        this.scene.remove(this.transitionOld);
      }
      this.transitionOld = undefined;
      this.transitionNew.scale.set(1, 1, 1);
      this.transitionNew = undefined;
    }
  }

    // hover detection only when menu visible
    if (this.menuVisible) {
      // mouse pointer
      this.raycaster.setFromCamera(this.mouse, this.camera);
      this.menu.handlePointer(this.raycaster);
      if (this.quickLoad && this.quickLoad.object3d.visible) {
        this.quickLoad.handlePointer(this.raycaster);
      }
      // controller pointers (only when in XR)
      if (this.renderer.xr.isPresenting) {
        for (const ctrl of this.controllers) {
          const origin = new THREE.Vector3();
          ctrl.getWorldPosition(origin);
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(new THREE.Quaternion()));
          this.raycaster.ray.origin.copy(origin);
          this.raycaster.ray.direction.copy(dir);
          this.menu.handlePointer(this.raycaster);
      if (this.quickLoad && this.quickLoad.object3d.visible) {
        this.quickLoad.handlePointer(this.raycaster);
      }
        }
      }
    }

    if (!this.useOrbit) {
      const speed = 3; // units per second
      if (this.keys.forward) this.walk.moveForward(speed * delta);
      if (this.keys.back) this.walk.moveForward(-speed * delta);
      if (this.keys.left) this.walk.moveRight(-speed * delta);
      if (this.keys.right) this.walk.moveRight(speed * delta);
    }

    // VR locomotion via left controller thumbstick
    if (this.renderer.xr.isPresenting) {
      for (const ctrl of this.controllers) {
        const origin = new THREE.Vector3();
        ctrl.getWorldPosition(origin);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(new THREE.Quaternion()));
        this.raycaster.ray.origin.copy(origin);
        this.raycaster.ray.direction.copy(dir);
        this.menu.handlePointer(this.raycaster);
      if (this.quickLoad && this.quickLoad.object3d.visible) {
        this.quickLoad.handlePointer(this.raycaster);
      }
          // read stick axes
          const src = ctrl.userData.inputSource as XRInputSource | undefined;
          if (!src || !src.gamepad) continue;
          const axes = src.gamepad.axes;
          // Quest may map left stick to indices 2/3
          const x = axes.length >= 4 ? axes[2] : axes[0] || 0;
          const y = axes.length >= 4 ? axes[3] : axes[1] || 0;
          const dead = 0.05;
          if (Math.abs(x) < dead && Math.abs(y) < dead) {
            // still log occasionally to see axes values
            this.debugTimer += delta;
            if (this.debugTimer > 1) {
              console.log(`axes zero-ish: [${axes.map(a=>a.toFixed(2)).join(', ')}]`);
              this.debugTimer = 0;
            }
            continue;
          }

          // build movement vectors
          dir.y = 0;
          dir.normalize();
          const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
          const move = new THREE.Vector3()
            .addScaledVector(dir, -y * this.vrSpeed * delta)
            .addScaledVector(right, x * this.vrSpeed * delta);

          this.userRig.position.add(move);

          // debug log once per second
          this.debugTimer += delta;
          if (this.debugTimer > 1) {
            console.log(`axes raw: [${axes.map(a=>a.toFixed(2)).join(', ')}] selected (${x.toFixed(2)}, ${y.toFixed(2)})`);
            this.debugTimer = 0;
          }
        }
      }
    this.renderer.render(this.scene, this.camera);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
