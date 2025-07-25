import type { ConfinedSpaceXR } from '../scenes/ConfinedSpaceXR';

export class NetworkManager {
  private socket: WebSocket | null = null;
  private scene: ConfinedSpaceXR;

  constructor(scene: ConfinedSpaceXR) {
    this.scene = scene;
    this.connect();
  }

  private connect() {
    // Use ws:// for local development
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // The name 'vr-molecule-viewer-server' comes from our render.yaml
    const serverUrl = isLocal ? 'ws://localhost:8080' : 'wss://vr-molecule-viewer-server.onrender.com';

    this.socket = new WebSocket(serverUrl);

    this.socket.onopen = () => {
      console.log('NetworkManager: Connected to server.');
    };

    this.socket.onmessage = (event) => {
      console.log(`NetworkManager: Received message: ${event.data}`);
      const message = JSON.parse(event.data);
      if (message.type === 'load' && message.pdbId) {
        console.log(`NetworkManager: Instructing scene to load PDB: ${message.pdbId}`);
        // The 'false' argument prevents an infinite loop of broadcasting
        this.scene.loadPdbId(message.pdbId, false);
      }
    };

    this.socket.onclose = () => {
      console.log('NetworkManager: Disconnected from server.');
      // Optional: implement reconnection logic
      this.socket = null;
    };

    this.socket.onerror = (error) => {
      console.error('NetworkManager: WebSocket error:', error);
    };
  }

  public sendMessage(message: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(message);
    } else {
      console.warn('NetworkManager: Cannot send message, socket is not open.');
    }
  }
}
