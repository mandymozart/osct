import { GameStoreService } from "../services/GameStoreService";
import { IGame } from "../types";

export interface IPageMinimal extends HTMLElement {
    active: boolean;
    readonly styles: string;
    readonly template: string;
    readonly baseStyles: string;
    setupEventListeners(): void;
    cleanupEventListeners(): void;
    render(): void;
}

/**
 * Page with minimal styling but access to game store and router enabled visibility.
 */
export abstract class PageMinimal extends HTMLElement implements IPageMinimal {
    protected _active: boolean;
    private _template: HTMLTemplateElement;
    protected game: Readonly<IGame>;
    
    constructor() {
      super();
      this.game = GameStoreService.getInstance();;
      this.attachShadow({ mode: "open" });
      this._active = false;
      this._template = document.createElement('template');
    }
  
    static get observedAttributes() {
      return ["active"];
    }
  
    get active() {
      return this._active;
    }
  
    set active(value: boolean) {
      this._active = value;
      this.setAttribute("active", value.toString());
    }

    /**
     * Handle attribute changes
     * @param name The name of the attribute that changed
     * @param oldValue The previous value of the attribute
     * @param newValue The new value of the attribute
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
      if (name === 'active' && oldValue !== newValue) {
        this._active = newValue === 'true';
        // Additional handling for active state could be done here
      }
    }

    public get baseStyles(): string {
      return /* css */ `
        :host {
          z-index: var(--page-z-index, 1000);
          transition: all 0.3s ease;
          transform: translateY(20vh);
          opacity: 0;
          visibility: hidden;
        }
        :host([active=true]) {
          visibility: visible;
          transform: translateY(0);
          opacity: 1;
        }
        .content {
        }
      `;
    }

    public get template(): string {
      return /* html */ `
        <div class="content">
          <slot></slot>
        </div>
      `;
    }

    /**
     * Additional styles - must be implemented by child classes
     */
    public abstract get styles(): string;
  
    connectedCallback() {
      this.render();
      this.setupEventListeners();
    }

    disconnectedCallback() {
      this.cleanupEventListeners();
    }
  
    public render() {
      // Clear existing content
      while (this.shadowRoot!.firstChild) {
        this.shadowRoot!.removeChild(this.shadowRoot!.firstChild);
      }
      
      // Create template content
      this._template.innerHTML = /* html */ `
        <style>
          ${this.baseStyles}
          ${this.styles}
        </style>
        ${this.template}
      `;
      
      // Clone and append template
      this.shadowRoot!.appendChild(this._template.content.cloneNode(true));
    }

    public setupEventListeners(): void {}

    public cleanupEventListeners(): void {}
}