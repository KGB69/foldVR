import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';
import { RadialMenu } from '../ui/RadialMenu';
import { QuickLoadPanel } from '../ui/QuickLoadPanel';
import { UIPanelManager } from '../ui/UIPanelManager';
import { loadPDB, Atom, createBallStick, createSpaceFill, createWireframe, createTransparentSurface, createRibbon } from '../molecule/PDBLoader';
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

  // unified UI panel manager
  private panels!: UIPanelManager;
  // convenience getter for quick-load panel
  private get quickLoad(): QuickLoadPanel { return this.panels.getQuickLoadPanel(); }
  // left-hand references for "watch" radial menu
  private leftController?: THREE.Object3D;
  private leftGrip?: THREE.Object3D;
  private moleculeGroup?: THREE.Group;
  private atoms?: Atom[];
  private repIndex = 0;
  // TODO queue (polish) -----------------------------------------------------
  // 1. Re-measure bounding box after each representation switch to keep
  //    scale consistent across modes.
  // 2. Transparent-surface representation currently occludes radial menu;
  //    set depthWrite = false and an appropriate renderOrder.
  // ------------------------------------------------------------------------
  private repBuilders = [createBallStick, createSpaceFill, createWireframe, createTransparentSurface, createRibbon];
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

  // context-sensitive radial menu (right controller trigger long-press)
  private rightController?: THREE.Object3D;
  private triggerHeld = false;
  private triggerHoldDuration = 0;
  private contextMenu?: RadialMenu;
  private contextMenuVisible = false;

  /** Dispose geometries & materials of a molecule group to free GPU memory. */
  private disposeGroup(group: THREE.Group) {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          (mesh.material as THREE.Material).dispose();
        }
      }
    });
    // flush internal Three.js caches
    this.renderer.renderLists.dispose();
  }

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

    // menu – attach to user rig so it follows the player
    this.menu = new RadialMenu();
    // Scale radial menu down slightly for less intrusive size
    this.menu.object3d.scale.setScalar(0.8);
    // Remove from previous parent if any (safety)
    if (this.menu.object3d.parent) {
      this.menu.object3d.parent.remove(this.menu.object3d);
    }
    this.menu.object3d.position.set(0, 0.07, -0.15); // default offset when anchored to wrist
    this.userRig.add(this.menu.object3d); // temporary parent until left grip detected

    // initialise panel manager
    this.panels = new UIPanelManager(this.camera, this.scene);
    this.panels.onQuickLoadSelect = (id: string) => {
      this.loadPdbId(id);
      // close whichever panel was open
      const pdbPanel = (this.panels as any).getPdbInputPanel?.();
      if (pdbPanel && pdbPanel.object3d.visible) this.panels.toggle('pdbInput');
      if (this.quickLoad.object3d.visible) this.panels.toggle('quickLoad');
      // restore wrist menu
      this.menuVisible = true;
      this.menu.object3d.visible = true;
    };

    // Panels are now managed by UIPanelManager
    /*([
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
    this.helpPanel.object3d.position.set(0, 1.6, -1.5);
    this.helpPanel.hide();
    this.scene.add(this.helpPanel.object3d);

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
    */

    

    // HTML overlay for molecule loading
    this.loadOverlay = new LoadOverlay();
    this.loadOverlay.onLoad = (id) => this.loadPdbId(id);

    // keyboard toggle for menu visibility
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleMenu();
    });

    // link menu actions using panel manager
    this.menu.setAction('Help', () => this.panels.toggle('help'));
    this.menu.setAction('Settings', () => this.panels.toggle('settings'));
    this.menu.setAction('Visuals', () => this.cycleRepresentation());
    this.menu.setAction('Load', () => {
      if (this.renderer.xr.isPresenting) {
        const opened = this.panels.toggle('pdbInput');
        this.menuVisible = !opened;
        this.menu.object3d.visible = this.menuVisible;
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
      if (this.moleculeGroup) {
      this.disposeGroup(this.moleculeGroup);
      this.scene.remove(this.moleculeGroup);
    }
      this.moleculeGroup = group;
      this.atoms = atoms;
      this.repIndex = 0;

    // reset any prior offset so centering is handled consistently
    group.position.set(0, 0, 0);

    // 1) Uniformly scale so the molecule fits within ~1 unit height.
      let bbox = new THREE.Box3().setFromObject(group);
      const height = bbox.max.y - bbox.min.y;
      this.moleculeScale = height > 0 ? 1 / height : 1;
      group.scale.setScalar(this.moleculeScale);

      // 2) Recompute bounds after scaling to obtain accurate center/min values.
      group.updateMatrixWorld(true);
      bbox = new THREE.Box3().setFromObject(group);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const minY = bbox.min.y;

      // 3) Position so X/Z center aligns with world origin and base sits at y=1 (pedestal top)
      group.position.set(-center.x, 1 - minY, -center.z);

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

/*
    // position panel a fixed distance in front of camera, facing the camera
    const distance = 1.5;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
    panel.object3d.position.copy(pos);
    panel.object3d.lookAt(this.camera.position);

  }

  // togglePanel removed in favour of UIPanelManagerpanel: BasePanel) {
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
*/

  // keyboard toggle kept for desktop testing; does not affect wrist logic
  private toggleMenu() {
    this.menuVisible = !this.menuVisible;
    this.menu.object3d.visible = this.menuVisible;
    this.menu.setOpacity(this.menuVisible ? 1 : 0);
  }

  private setupControllers() {
    const controllerModelFactory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      // corresponding grip and visual model
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(controllerModelFactory.createControllerModel(grip));
      this.userRig.add(grip);
      controller.addEventListener('selectstart', () => {
        // If any panel is open that uses select(), forward to panel manager first
        if (this.panels.handleSelect()) {
          // panel consumed or closed; restore menu
          this.menuVisible = true;
          this.menu.object3d.visible = true;
        } else if (this.menuVisible) {
          this.menu.select();
        }

        // start long-press timer for right-hand context menu
        if (controller === this.rightController) {
          this.triggerHeld = true;
          this.triggerHoldDuration = 0;
        }
        // haptic pulse
        const input = (controller as any).inputSource as XRInputSource | undefined;
        const gamepad = input?.gamepad;
        const haptic = gamepad?.hapticActuators?.[0];
        haptic?.pulse?.(0.5, 100);
      });
      // trigger release – finish or cancel context menu
      controller.addEventListener('selectend', () => {
        if (controller === this.rightController) {
          if (this.contextMenuVisible && this.contextMenu) {
            this.contextMenu.select();
            this.scene.remove(this.contextMenu.object3d);
            this.contextMenu = undefined;
            this.contextMenuVisible = false;
          }
          this.triggerHeld = false;
          this.triggerHoldDuration = 0;
        }
      });
      controller.addEventListener('connected', (event: any) => {
        controller.userData.inputSource = event.data;
        // set left references & re-parent menu when first left controller connects
        if (event.data.handedness === 'left') {
          this.leftController = controller;
          this.leftGrip = grip;
          // move menu to wrist
          if (this.menu.object3d.parent) this.menu.object3d.parent.remove(this.menu.object3d);
          this.leftGrip.add(this.menu.object3d);
          this.menu.object3d.position.set(0, 0.07, -0.15);
          this.menu.object3d.visible = false;
          this.menu.setOpacity(0);
          this.menuVisible = false;
        } else if (event.data.handedness === 'right') {
          this.rightController = controller;
        }
      });
      // wrist-watch style show/hide using grip squeeze
      controller.addEventListener('squeezestart', () => {
        if (controller === this.leftController) {
          this.menuVisible = true;
          this.menu.object3d.visible = true;
          this.menu.setOpacity(1);
        }
      });
      controller.addEventListener('squeezeend', () => {
        if (controller === this.leftController) {
          this.menuVisible = false;
          this.menu.object3d.visible = false;
          this.menu.setOpacity(0);
        }
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

      

      this.controllers.push(controller);
    }
  }

  private animate() {
  this.panels.update();
    const delta = this.clock.getDelta();
    // update orbit controls if enabled
    if (this.useOrbit) this.orbit.update();

  // subtle rotation animation for the loaded molecule
  if (this.moleculeGroup) {
    this.moleculeGroup.rotation.y += 0.2 * delta;
  }

    if (this.menuVisible) {
      this.menu.update(delta);
    }

    // detect right trigger long-press for context menu
    if (this.rightController && this.triggerHeld) {
      const src = this.rightController.userData.inputSource as XRInputSource | undefined;
      const pressed = src?.gamepad?.buttons?.[0]?.pressed;
      if (pressed) {
        this.triggerHoldDuration += delta;
        const HOLD_TIME = 0.4;
        if (!this.contextMenuVisible && this.triggerHoldDuration > HOLD_TIME) {
          // perform raycast from right controller
          const origin = new THREE.Vector3();
          this.rightController.getWorldPosition(origin);
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.rightController.getWorldQuaternion(new THREE.Quaternion()));
          this.raycaster.ray.origin.copy(origin);
          this.raycaster.ray.direction.copy(dir);
          let point = origin.clone().add(dir.multiplyScalar(1)); // default 1 m ahead
          if (this.moleculeGroup) {
            const its = this.raycaster.intersectObjects([this.moleculeGroup], true);
            if (its.length) point = its[0].point;
          }
          this.showContextMenu(point);
        }
      } else {
        // trigger released before hold threshold
        this.triggerHeld = false;
        this.triggerHoldDuration = 0;
      }
    }
    // Disabled automatic facing to avoid disorienting yaw spin while moving
    // this.menu.object3d.lookAt(this.camera.position);

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
        if (this.transitionOld) this.scene.remove(this.transitionOld);
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
      this.panels.handlePointer(this.raycaster);
      if (this.quickLoad && this.quickLoad.object3d.visible) {
        this.quickLoad.handlePointer(this.raycaster);
      if (this.contextMenuVisible && this.contextMenu) {
        this.contextMenu.handlePointer(this.raycaster);
      }
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
      this.panels.handlePointer(this.raycaster);
      if (this.quickLoad && this.quickLoad.object3d.visible) {
        this.quickLoad.handlePointer(this.raycaster);
      if (this.contextMenuVisible && this.contextMenu) {
        this.contextMenu.handlePointer(this.raycaster);
      }
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
      this.panels.handlePointer(this.raycaster);
      if (this.quickLoad && this.quickLoad.object3d.visible) {
        this.quickLoad.handlePointer(this.raycaster);
      if (this.contextMenuVisible && this.contextMenu) {
        this.contextMenu.handlePointer(this.raycaster);
      }
      }
          // read stick axes
          const src = ctrl.userData.inputSource as XRInputSource | undefined;
          if (!src || !src.gamepad) continue;
          const axes = src.gamepad.axes;
          // Quest may map left stick to indices 2/3
          const x = axes.length >= 4 ? axes[2] : axes[0] || 0;
          const y = axes.length >= 4 ? axes[3] : axes[1] || 0;
          const dead = 0.05;

          // thumbstick hover for radial menu (left controller only)
          if (this.menuVisible && ctrl === this.leftController) {
            const radius = Math.hypot(x, y);
            if (radius > dead) {
              const angle = Math.atan2(x, y); // 0 rad at stick up, increasing clockwise
              const count = this.menu.getItemCount();
              const seg = (2 * Math.PI) / count;
              const norm = (angle + 2 * Math.PI) % (2 * Math.PI);
              const idx = Math.floor(norm / seg);
              this.menu.setHover(idx);
            } else {
              this.menu.setHover(-1);
            }
          }

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
    if (this.contextMenuVisible && this.contextMenu) {
      this.contextMenu.object3d.lookAt(this.camera.position);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Spawn context-sensitive radial menu at the specified world position.
   */
  private showContextMenu(worldPos: THREE.Vector3) {
    // remove any previous context menu
    if (this.contextMenu) {
      this.scene.remove(this.contextMenu.object3d);
    }
    // TODO: build real context-aware items. Placeholder actions for phase-1.
    const items = [
      { label: 'Info',   action: () => console.log('Info (todo)') },
      { label: 'Center', action: () => this.camera.lookAt(worldPos) },
      { label: 'Hide',   action: () => {
        if (this.moleculeGroup) {
          this.disposeGroup(this.moleculeGroup);
          this.scene.remove(this.moleculeGroup);
          this.moleculeGroup = undefined as any;
          this.atoms = undefined as any;
        }
      } },
    ];
    // @ts-ignore – accept plain object array as MenuItem[]
    this.contextMenu = new RadialMenu(items);
    this.contextMenu.object3d.position.copy(worldPos);
    this.contextMenu.object3d.lookAt(this.camera.position);
    this.scene.add(this.contextMenu.object3d);
    this.contextMenuVisible = true;
  }

/* obsolete helper removed

  
    if (p.object3d.visible) this.placePanel(p);
  };
  update(this.helpPanel);
  update(this.settingsPanel);
  update(this.visPanel);
  
*/

private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
