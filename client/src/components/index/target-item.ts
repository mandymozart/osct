import { GameStoreService } from "@/services/GameStoreService";
import { IGame, TargetData } from "@/types";

export interface ITargetItem extends HTMLElement {
  target: TargetData | null;
  isCurrent: boolean;
  isExpanded: boolean;
  chapterId?: string | null;
  targetIndex?: number;
}

/**
 * TargetItem Component
 *
 * Displays a target item in the index page
 */
export class TargetItem extends HTMLElement implements ITargetItem {
  private _target: TargetData | null = null;
  private _isCurrent = false;
  private _isExpanded = false;
  private _hasBeenSeen = false;
  private game: Readonly<IGame>;
  private _chapterId: string | null = null;
  private _targetIndex: number = -1;

  static get observedAttributes() {
    return ["is-current", "is-expanded", "chapter-id", "target-index"];
  }

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    this.handleClick = this.handleClick.bind(this);
  }
  
  connectedCallback() {
    this.render();
    // this.game.subscribeToProperty("history", this.handleHistoryStateChanged.bind(this));
    // this.game.subscribeToProperty("trackedTargets", this.handleTrackedTargetsChanged.bind(this));
    this.addEventListener("click", this.handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.handleClick);
  }

  private handleHistoryStateChanged() {
    const hasBeenSeen = this.game?.history.hasTargetBeenSeen(this._chapterId || "", this._targetIndex) ?? false;
    console.log("[TargetItem] hasBeenSeen:", hasBeenSeen, this._chapterId, this._targetIndex, this._target);
    if(this._hasBeenSeen !== hasBeenSeen) {
      this._hasBeenSeen = hasBeenSeen;
      this.render();
    }
  }

  private handleTrackedTargetsChanged() {

    const isCurrent = (this.game?.state.trackedTargets ?? []).includes(this._target?.mindarTargetIndex ?? -1);
    console.log("[TargetItem] isCurrent:", isCurrent, this._target?.mindarTargetIndex);
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
    } else if (name === "chapter-id") {
      this._chapterId = newValue;
      this.render();
    } else if (name === "target-index") {
      this._targetIndex = parseInt(newValue, 10);
      this.render();
    }
  }

  private render() {
    if (!this.shadowRoot || !this._target) return;

    // Determine if this target has been seen
    const hasBeenSeen = this._hasBeenSeen;

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
          margin: 0 1rem;
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
        
        .seen-indicator {
          display: inline-block;
          width: 0.75rem;
          height: 0.75rem;
          border-radius: 50%;
          margin-left: 0.5rem;
          background-color: var(--primary-300);
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
          <div class="target-id">${this._target.bookId}</div>
          <div class="target-text">
            <div class="target-title">
              ${this._target.title || "Untitled Target"}
              <span class="seen-indicator" title="${
                hasBeenSeen ? "Already seen" : "Not seen yet"
              }"></span>
            </div>
            
            <div class="target-description"><p>${
              this._target.description || "No description available"
            }</p>
            <div class="meta-info">${
              hasBeenSeen ? "Seen" : "Not seen yet"
            }</div>
            </div>
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
    return this._target.imageTargetSrc;
    // return `assets/images/images-${this._target.bookId}.jpg`;
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
  get target(): TargetData | null {
    return this._target;
  }

  set target(value: TargetData | null) {
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

  // Add chapter ID getter and setter
  get chapterId(): string | null {
    return this._chapterId;
  }

  set chapterId(value: string | null) {
    if (value) {
      this._chapterId = value;
      this.setAttribute("chapter-id", value);
    } else {
      this._chapterId = null;
      this.removeAttribute("chapter-id");
    }
  }

  // Add target index getter and setter
  get targetIndex(): number {
    return this._targetIndex;
  }

  set targetIndex(value: number) {
    this._targetIndex = value;
    this.setAttribute("target-index", String(value));
  }
}

customElements.define("target-item", TargetItem);
