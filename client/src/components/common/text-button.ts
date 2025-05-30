export class TextButton extends HTMLButtonElement {
    constructor() {
      super();
      // We can't use shadow DOM when extending built-in elements
      // Instead, we'll create a style element for each instance
      this.setupStyles();
    }
  
    static get observedAttributes() {
      return ["variant", "size", "disabled", "active", "inverted"];
    }
  
    // Getter and setter for text content
    set text(val) {
      this.textContent = val;
    }
    
    get text() {
      return this.textContent;
    }
  
    /**
     * Get and set active state
     */
    get active() {
      return this.hasAttribute('active');
    }
    
    set active(value) {
      if (value) {
        this.setAttribute('active', '');
      } else {
        this.removeAttribute('active');
      }
    }
  
    /**
     * Get and set inverted state
     */
    get inverted() {
      return this.hasAttribute('inverted');
    }
    
    set inverted(value) {
      if (value) {
        this.setAttribute('inverted', '');
      } else {
        this.removeAttribute('inverted');
      }
    }
  
    // CSS styles as a string
    get styles() {
      return /* css */ `
        /* Since this will be a unique style element for this component, 
           we need to target the style appropriately for shadow DOM isolation */
        :host button[is="text-button"],
        button[is="text-button"] {
          border-radius: 2rem;
          border: 1px solid var(--color-primary, #000);
          padding: 0 2rem;
          line-height: 4rem;
          font-size: 1.5rem;
          font-weight: 500;
          font-family: inherit;
          text-transform: uppercase;
          background-color: var(--color-background, #f9f9f9);
          color: var(--color-primary, #000);
          cursor: pointer;
          transition: border-color 0.25s, background-color 0.25s, color 0.25s;
          -webkit-transition: border-color 0.25s, background-color 0.25s, color 0.25s;
          outline: none;
          /* iOS Safari compatibility fixes */
          -webkit-appearance: none;
          appearance: none;
          box-sizing: border-box;
          /* Flex display for all browsers */
          display: -webkit-box;
          display: -webkit-flex;
          display: flex;
          -webkit-box-align: center;
          -webkit-align-items: center;
          align-items: center;
          -webkit-box-pack: center;
          -webkit-justify-content: center;
          justify-content: center;
          /* Hardware acceleration for smoother transitions */
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
          /* Fix for Safari flex gaps */
          margin: 0;
        }

        :host button[is="text-button"]:hover,
        button[is="text-button"]:hover {
          border-color: var(--color-secondary, #646cff);
          color: var(--color-secondary, #646cff);
        }
        
        :host button[is="text-button"]:active,
        button[is="text-button"]:active {
          color: var(--color-secondary, #646cff);
          background-color: var(--color-background, #f9f9f9);
        }
        
        /* Add active state selector with class */
        :host button[is="text-button"].active,
        button[is="text-button"].active,
        /* Also keep attribute selector for backward compatibility */
        :host button[is="text-button"][active],
        button[is="text-button"][active] {
          color: var(--color-secondary, #646cff);
          border-color: var(--color-secondary, #646cff);
          background-color: var(--color-background, #f9f9f9);
        }
        
        :host button[is="text-button"][variant="secondary"],
        button[is="text-button"][variant="secondary"] {
          border-color: var(--color-secondary, #747bff);
          color: var(--color-secondary, #747bff);
        }
        
        :host button[is="text-button"][variant="secondary"][active],
        button[is="text-button"][variant="secondary"][active] {
          background-color: var(--color-secondary, #747bff);
          color: var(--color-background, #f9f9f9);
        }
  
        /* Inverted flag - can be applied to any variant */
        :host button[is="text-button"][inverted],
        button[is="text-button"][inverted] {
          background-color: var(--color-primary, #000);
          color: var(--color-background, #f9f9f9);
          border-color: var(--color-primary, #000);
        }
        
        :host button[is="text-button"][inverted]:hover,
        button[is="text-button"][inverted]:hover {
          background-color: var(--color-secondary, #747bff);
          border-color: var(--color-secondary, #747bff);
          color: var(--color-background, #f9f9f9);
        }
        
        :host button[is="text-button"][inverted][active],
        button[is="text-button"][inverted][active] {
          background-color: var(--color-secondary, #747bff);
          border-color: var(--color-secondary, #747bff);
        }
        
        /* Inverted when combined with secondary variant */
        :host button[is="text-button"][variant="secondary"][inverted],
        button[is="text-button"][variant="secondary"][inverted] {
          background-color: var(--color-secondary, #747bff);
          color: var(--color-background, #f9f9f9);
          border-color: var(--color-secondary, #747bff);
        }
        
        :host button[is="text-button"][variant="secondary"][inverted][active],
        button[is="text-button"][variant="secondary"][inverted][active] {
          background-color: var(--color-primary, #000);
          border-color: var(--color-primary, #000);
          color: var(--color-background, #f9f9f9);
        }

        :host button[is="text-button"][size="xs"],
        button[is="text-button"][size="xs"] {
          font-size: .75rem;
          padding: 0 .5rem;
          line-height: 1rem;
        }
  
        :host button[is="text-button"][size="sm"],
        button[is="text-button"][size="sm"] {
          font-size: 1rem;
          padding: 0 1rem;
          line-height: 2rem;
        }
  
        :host button[is="text-button"][size="lg"],
        button[is="text-button"][size="lg"] {
          font-size: 2rem;
          padding: 0 3rem;
        }
  
        :host button[is="text-button"][disabled],
        button[is="text-button"][disabled] {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `;
    }
  
    // Set up styles that work in both shadow DOM and light DOM contexts
    setupStyles() {
      // Generate a unique style ID for this component
      const styleId = 'text-button-styles';
      
      // First try to inject in the parent shadow root if we're in one
      let target: Document | ShadowRoot = document;
      let root = this.getRootNode();
      
      if (root instanceof ShadowRoot) {
        target = root;
      }
      
      // Only add styles once per root
      if (!target.getElementById(styleId)) {
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = this.styles;
        
        if (target === document) {
          document.head.appendChild(styleElement);
        } else {
          target.appendChild(styleElement);
        }
      }
    }
    
    connectedCallback() {
      this.setupEventListeners();
      // Ensure styles are applied to the current root
      this.setupStyles();
    }
  
    disconnectedCallback() {
      this.cleanupEventListeners();
    }
  
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
      // No special handling needed - styling is handled via CSS attribute selectors
    }
  
    setupEventListeners() {
      this.addEventListener('click', this.handleClick);
    }
  
    cleanupEventListeners() {
      this.removeEventListener('click', this.handleClick);
    }
    
    handleClick = (e:Event) => {
      // Dispatch custom event in addition to normal button click
      this.dispatchEvent(new CustomEvent('button-click', {
        bubbles: true,
        composed: true, // This is important to cross shadow DOM boundaries
        detail: { originalEvent: e }
      }));
    }
  }
  
  // Register custom element - note the third parameter needed for extending built-in elements
  customElements.define('text-button', TextButton, { extends: 'button' });