import { GameStoreService } from "@/services/GameStoreService";
import { IGame, Target } from "@/types";
import { getEntry } from "@/utils/game-config";

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
  private game: Readonly<IGame>;

  static get observedAttributes() {
    return ["is-current", "is-expanded"];
  }

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    this.handleClick = this.handleClick.bind(this);
  }
  
  connectedCallback() {
    this.render();
    // Progress changes re-render the whole list (spread-list subscribes to the store)
    // this.game.subscribeToProperty("trackedTargets", this.handleTrackedTargetsChanged.bind(this));
    this.addEventListener("click", this.handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.handleClick);
  }

  private handleTrackedTargetsChanged() {

    const isCurrent = (this.game?.state.trackedTargets ?? []).includes(this._target?.id ?? "");
    console.log("[TargetItem] isCurrent:", isCurrent, this._target?.id);
    this.shadowRoot?.querySelector(".target-item")?.classList.toggle("current", isCurrent);
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

    // Two stages of discovery: unlocked (target found) → consulted (entry opened)
    const entry = getEntry(this._target.entryId);
    const isUnlocked = this.game.history.isUnlocked(this._target.id);
    const isConsulted = this.game.history.isConsulted(this._target.entryId);
    const status = isConsulted ? "Consulted" : isUnlocked ? "Unlocked" : "Not found yet";

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
        }
        
        .target-item {
          cursor: pointer;
          display: grid;
          grid-template-columns: auto 8rem;
          gap: 1rem;
          margin: 0 1rem;
          line-height: 3rem;
          border-bottom: .1rem solid var(--color-primary);
        }
        
        .target-title {
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
        
        .seen-indicator {
          display: inline-block;
          width: 0.75rem;
          height: 0.75rem;
          border-radius: 50%;
          margin-left: 0.5rem;
          border: .1rem solid var(--primary-300);
        }

        .seen-indicator.unlocked {
          background-color: var(--primary-300);
        }

        .seen-indicator.consulted {
          background-color: var(--color-primary);
          border-color: var(--color-primary);
        }
        
        .meta-info {
          font-size: 0.75rem;
          color: var(--primary-400);
          margin-top: 0.25rem;
        }
      </style>
      
      <div class="target-item ${this._isCurrent ? "current" : "muted"} ${
      this._isExpanded ? "expanded" : ""
    }">
          <div class="target-text">
            <div class="target-title">
              ${entry?.title || "Untitled Target"}
              <span class="seen-indicator ${isConsulted ? "consulted" : isUnlocked ? "unlocked" : ""}" title="${status}"></span>
            </div>
            
            <div class="target-description"><p>${
              entry?.body || "No description available"
            }</p>
            <div class="meta-info">${status}</div>
            </div>
          </div>
          <div class="target-image">
            <img src="${this.getTargetImageUrl()}" alt="${
      entry?.title || "target image"
    }" loading="lazy">
          </div>
      </div>
    `;
  }

  private getTargetImageUrl(): string {
    if (!this._target) return "";
    return this._target.imageSrc;
  }

  private handleClick(event: Event) {
    if (!this._target) return;

    // Toggle expansion
    this.dispatchEvent(
      new CustomEvent("target-toggle", {
        bubbles: true,
        composed: true,
        detail: { targetId: this._target.id },
      })
    );

    // If not current, dispatch event to activate parent spread
    if (!this._isCurrent) {
      this.dispatchEvent(
        new CustomEvent("target-select", {
          bubbles: true,
          composed: true,
          detail: { targetId: this._target.id },
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
