import { ConfinedSpaceXR } from './scenes/ConfinedSpaceXR';

// bootstrap
window.addEventListener('DOMContentLoaded', () => {
  const app = new ConfinedSpaceXR();
  app.init();
});
