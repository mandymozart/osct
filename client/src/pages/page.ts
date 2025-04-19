import { GameStoreService } from "../services/GameStoreService";
import { IGame } from "../types";

// TODO: Fix protected properties in the abstract class def
export interface IPage extends HTMLElement {
    active: boolean;
    readonly styles: string;
    readonly template: string;
    readonly baseStyles: string;
    setupEventListeners(): void;
    cleanupEventListeners(): void;
    render(): void;
}

export abstract class Page extends HTMLElement implements IPage {
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
          position: fixed;
          top: var(--offset-top, 3rem);
          left: 0;
          width: 100%;
          height: calc(100% - var(--offset-top, 3rem));
          display: flex;
          flex-direction: column;
          background: var(--color-background);
          border-radius: 1.5rem 1.5rem 0 0;
          z-index: var(--page-z-index, 1000);
          transition: all 1s ease;
          opacity: 0;
          visibility: hidden;
          overflow-y: auto;
          box-shadow: 0px 1px 14px 0px rgba(0,0,0,0.34);
          -webkit-box-shadow: 0px 1px 14px 0px rgba(0,0,0,0.34);
          -moz-box-shadow: 0px 1px 14px 0px rgba(0,0,0,0.34);
        }
        :host([active=true]) {
          visibility: visible;
          opacity: 1;
        }
        .header {
          height: 6rem;
          display: flex;
          align-items: center;
          justify-content: center;
          position: absolute;
          top: 0;
          width: 100%;
        }
        .header h2 {
          margin:0;
          font-weight: 400;
          font-size: 1.5rem;
          color: var(--primary-500);
          line-height: 6rem;
          padding: 2rem 5rem 1rem 1rem;
        }
        .content {
          bottom: 10rem;
          top: 0;
          position: relative;
        }
      `;
    }

    public get template(): string {
      return /* html */ `
        <div class="header">
          <h2><slot name="title"></slot></h2>
          <slot name="close"></slot>
        </div>
        <div class="content">
          <slot name="content"></slot>
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