import { GameStoreService } from "@/services";
import { IGame } from "@/types";

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
 * Base page without a visual frame: access to the game store and visibility driven by the router's
 * `active` attribute. Subclasses provide `styles` and `template`.
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

    attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
      if (name === 'active' && oldValue !== newValue) {
        this._active = newValue === 'true';
      }
    }

    public get baseStyles(): string {
      return /* css */ `
        :host {
          z-index: var(--page-z-index, 1000);
          transition: opacity .3s ease, visibility .3s, transform .3s ease;
          transform: translateY(20vh);
          opacity: 0;
          visibility: hidden;
        }
        :host([active=true]) {
          visibility: visible;
          transform: translateY(0);
          opacity: 1;
        }
        /* A page fading out must not catch taps meant for the page below */
        :host(:not([active=true])) { pointer-events: none !important; }
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

    /** Page-specific styles, appended after `baseStyles` */
    public abstract get styles(): string;
  
    connectedCallback() {
      this.render();
      this.setupEventListeners();
    }

    disconnectedCallback() {
      this.cleanupEventListeners();
    }
  
    public render() {
      while (this.shadowRoot!.firstChild) {
        this.shadowRoot!.removeChild(this.shadowRoot!.firstChild);
      }
      
      this._template.innerHTML = /* html */ `
        <style>
          ${this.baseStyles}
          ${this.styles}
        </style>
        ${this.template}
      `;
      
      this.shadowRoot!.appendChild(this._template.content.cloneNode(true));
    }

    public setupEventListeners(): void {}

    public cleanupEventListeners(): void {}
}