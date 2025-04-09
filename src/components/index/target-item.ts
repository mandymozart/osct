import { Target } from "@/types";
import { assert } from "@/utils";

export interface ITargetItem extends HTMLElement {
  target: Target | null;
  isCurrent: boolean;
  isExpanded: boolean;
}

/**
 * TargetItem Component
 *
 * Displays a target item in the index page
 */
export class TargetItem extends HTMLElement implements ITargetItem {
  private _target: Target | null = null;
  private _isCurrent = false;
  private _isExpanded = false;

  static get observedAttributes() {
    return ["is-current", "is-expanded"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    this.render();
    this.addEventListener("click", this.handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.handleClick);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;

    if (name === "is-current") {
      this._isCurrent = newValue === "true";
      this.render();
    } else if (name === "is-expanded") {
      this._isExpanded = newValue === "true";
      this.render();
    }
  }

  private render() {
    if (!this.shadowRoot || !this._target) return;

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
        }
        
        .target-item {
          cursor: pointer;
          display: grid;
          grid-template-columns: 4rem auto 8rem;
          gap: 1rem;
          line-height: 3rem;
          border-bottom: .1rem solid var(--color-primary);
        }
        
        .target-id, .target-title {
          font-weight: 600;
        }

        .target-image {
          padding: 1rem 0 ;
        }
        
        .target-description, 
        .target-image img {
          display: none;
        }
        
        .target-item.expanded .target-description, 
        .target-item.expanded .target-image img {
          display: block;
        }
        
        .target-description {
          white-space: pre-line;
          line-height: 1.5;
        }
        
        .target-image img {
          max-width: 100%;
        }
        
        .current {
          color: var(--color-primary);
        }
        
        .muted {
          color: var(--primary-400);
          border-color: var(--primary-400);
        }
      </style>
      
      <div class="target-item ${this._isCurrent ? "current" : "muted"} ${
      this._isExpanded ? "expanded" : ""
    }">
          <div class="target-id">${this._target.bookId}</div>
          <div class="target-text">
            <div class="target-title">${
              this._target.title || "Untitled Target"
            }</div>
            <div class="target-description">${
              this._target.description || "No description available"
            }</div>
          </div>
          <div class="target-image">
            <img src="${this.getTargetImageUrl()}" alt="${
      this._target.description || "target image"
    }" loading="lazy">
          </div>
      </div>
    `;
  }

  private getTargetImageUrl(): string {
    if (!this._target) return "";
    return `assets/images/images-${this._target.bookId}.jpg`;
  }

  private handleClick(event: Event) {
    if (!this._target) return;

    // Toggle expansion
    this.dispatchEvent(
      new CustomEvent("target-toggle", {
        bubbles: true,
        composed: true,
        detail: { targetId: this._target.bookId },
      })
    );

    // If not current, dispatch event to activate parent chapter
    if (!this._isCurrent) {
      this.dispatchEvent(
        new CustomEvent("target-select", {
          bubbles: true,
          composed: true,
          detail: { targetId: this._target.bookId },
        })
      );
    }
  }

  // Getters and setters
  get target(): Target | null {
    return this._target;
  }

  set target(value: Target | null) {
    this._target = value;
    this.render();
  }

  get isCurrent(): boolean {
    return this._isCurrent;
  }

  set isCurrent(value: boolean) {
    this._isCurrent = value;
    this.setAttribute("is-current", String(value));
  }

  get isExpanded(): boolean {
    return this._isExpanded;
  }

  set isExpanded(value: boolean) {
    this._isExpanded = value;
    this.setAttribute("is-expanded", String(value));
  }
}

customElements.define("target-item", TargetItem);
