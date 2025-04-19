/**
 * SquareWindowOverlay Web Component
 * 
 * A web component that creates a semi-transparent overlay with a square
 * transparent window in the center, with responsive sizing between min and max values.
 */
export class QRSquareWindowOverlay extends HTMLElement {
    private minSize: string = '20rem';
    private maxSize: string = '30rem';
    private opacity: number = 1;
    
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.render();
    }
    
    connectedCallback() {
      this.render();
    }
    
    private render(): void {
      if (!this.shadowRoot) return;
      
      const styles = `
        :host {
          display: block;
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
        }
        
        .overlay-container {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        
        .top-section, .bottom-section {
          position: absolute;
          left: 0;
          width: 100%;
          background-color: rgba(0, 0, 0, ${this.opacity});
        }
        
        .top-section {
          top: 0;
        }
        
        .bottom-section {
          bottom: 0;
        }
        
        .middle-section {
          position: absolute;
          left: 0;
          width: 100%;
          display: flex;
        }
        
        .left-section, .right-section {
          height: 100%;
          background-color: rgba(0, 0, 0, ${this.opacity});
        }
        
        .window {
          height: 100%;
          box-sizing: border-box;
          position: relative;
        }
        
        .window::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 1.5rem;
          box-shadow: 0 0 0 600px rgba(0, 0, 0, ${this.opacity});
          pointer-events: none;
        }
      `;
      
      // Calculate window size - fluid between min and max sizes
      const windowSize = `clamp(${this.minSize}, 50vw, ${this.maxSize})`;
      
      this.shadowRoot.innerHTML = `
        <style>${styles}</style>
        <div class="overlay-container">
          <div class="top-section" style="height: calc(50% - ${windowSize}/2);"></div>
          
          <div class="middle-section" style="top: calc(50% - ${windowSize}/2); height: ${windowSize};">
            <div class="left-section" style="width: calc(50% - ${windowSize}/2);"></div>
            <div class="window" style="width: ${windowSize};"></div>
            <div class="right-section" style="width: calc(50% - ${windowSize}/2);"></div>
          </div>
          
          <div class="bottom-section" style="height: calc(50% - ${windowSize}/2);"></div>
        </div>
      `;
    }
  }
  
  // Register the web component
  customElements.define('qr-square-window-overlay', QRSquareWindowOverlay);