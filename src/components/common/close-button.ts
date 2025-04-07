/**
 * A reusable close button component
 */
export class CloseButton extends HTMLElement {
  private _onClose: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.render();
    this.setupEventListeners();
  }

  /**
   * Component styles
   */
  private get styles(): string {
    return /* css */ `
      :host {
        display: inline-block;
      }
      
      .close-button {
        position: absolute;
        top: 2rem;
        right: 2rem;
        background-color: var(--color-primary);
        color: white;
        border: none;
        border-radius: 50%;
        width: 2rem;
        height: 2rem;
        font-size: 1.5rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .close-button:hover {
        border-color: var(--color-secondary);
        background-color: var(--color-background);
        color: var(--color-secondary);
      }
    `;
  }
  
  /**
   * Set close handler function
   */
  set onClose(handler: () => void) {
    this._onClose = handler;
  }
  
  /**
   * Render component
   */
  private render(): void {
    if (!this.shadowRoot) return;
    
    this.shadowRoot.innerHTML = `
      <style>${this.styles}</style>
      <button class="close-button" aria-label="Close">
        <cross-icon></cross-icon>
      </button>
    `;
  }
  
  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    const closeButton = this.shadowRoot?.querySelector('.close-button');
    if (closeButton) {
      closeButton.addEventListener('click', this.handleClick.bind(this));
    }
  }
  
  /**
   * Handle click event
   */
  private handleClick(): void {
    // Dispatch a custom 'close' event
    this.dispatchEvent(new CustomEvent('close', {
      bubbles: true,
      composed: true
    }));
    
    // Call the onClose handler if provided
    if (this._onClose) {
      this._onClose();
    }
  }
}

customElements.define('close-button', CloseButton);
