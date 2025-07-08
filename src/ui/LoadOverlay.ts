import { loadPDB, Atom } from '../molecule/PDBLoader';

/**
 * Simple HTML overlay with an input and load button. Attaches to document.body.
 * Exposes show()/hide() and emits onLoad(id).
 */
export class LoadOverlay {
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private button: HTMLButtonElement;
  public onLoad: (id: string) => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      padding: '20px',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      borderRadius: '8px',
      display: 'none',
      zIndex: '1000',
      fontFamily: 'sans-serif',
    } as CSSStyleDeclaration);

    const label = document.createElement('span');
    label.textContent = 'PDB ID:';
    label.style.marginRight = '8px';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = '1CRN';
    this.input.style.width = '80px';
    this.input.style.marginRight = '8px';

    this.button = document.createElement('button');
    this.button.textContent = 'Load';

    this.button.addEventListener('click', () => {
      const id = this.input.value.trim();
      if (id) {
        this.hide();
        this.onLoad(id);
      }
    });

    this.root.appendChild(label);
    this.root.appendChild(this.input);
    this.root.appendChild(this.button);
    document.body.appendChild(this.root);
  }

  show() {
    this.root.style.display = 'block';
    this.input.focus();
  }

  hide() {
    this.root.style.display = 'none';
  }
}
