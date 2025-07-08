// Minimal ambient typings for Three.js and example modules.
// They can be replaced with precise typings later.

declare module 'three' {
  const Three: any;
  export = Three;
}
import * as THREE from 'three';

declare module 'three/examples/jsm/webxr/VRButton' {
  export const VRButton: {
    createButton: (renderer: THREE.WebGLRenderer) => HTMLElement;
  };
}

declare module 'three/examples/jsm/controls/OrbitControls' {
  import { Camera, MOUSE } from 'three';
  export class OrbitControls {
    constructor(object: Camera, domElement?: HTMLElement);
    enabled: boolean;
    target: THREE.Vector3;
    update(): void;
    dispose(): void;
    static MOUSE: typeof MOUSE;
  }
}

declare module 'three/examples/jsm/controls/PointerLockControls' {
  import { Camera, Vector3 } from 'three';
  export class PointerLockControls {
    constructor(camera: Camera, domElement?: HTMLElement);
    isLocked: boolean;
    lock(): void;
    unlock(): void;
    moveForward(distance: number): void;
    moveRight(distance: number): void;
    getObject(): Camera;
    getDirection(vector: Vector3): Vector3;
    dispose(): void;
  }
}
