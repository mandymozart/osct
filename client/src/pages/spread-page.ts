import { Spread, GameState, LoadingState } from "../types";
import { assert } from "../utils/assert";
import { PageMinimal } from "./page-minimal";
import { getInitialSpreadId, getSpread } from "@/utils/game-config";
import "@/components/scan/spread-menu";

export class SpreadPage extends PageMinimal {
  static get observedAttributes() {
    return ["spread-id"];
  }

  private spread: Spread | undefined = undefined;
  private spreadId: string | null = null;
  
// TODO: pointer events propagation when overlayed. but this depends on how we want to handle the overlay.

   get styles(): string {
    return /* css */ `
      :host {
        background: none;
        border-radius: 0;
        /* below the scan chrome (Mark + counter) */
        margin-top: calc(var(--offset-top, 4rem) + 3.5rem);
      }
      .content {
        overflow-y: auto;
        height: calc(100vh - var(--offset-top, 4rem) - 2rem);
      }
      .spread-card {
        border: 1px solid var(--color-primary);
        border-radius: 2rem;
        background: var(--color-background);
        padding: 0 0rem 0 5rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        justify-content: flex-start;
        cursor: pointer;
        transform: translateX(-8rem);
        transition: all 0.3s ease;
        pointer-events: auto;
        width: 15rem;
      }
      .spread-card .spread-icon {
        font-size: 2rem;
        width: 2rem;
        margin-right: 1rem;
        display: block;
        color: var(--color-primary);
      }
      .spread-card:hover {
        transform: translateX(-5rem);
        box-shadow: 0 0.25rem 0.5rem rgba(0,0,0,0.1);
      }
      .spread-card.active {
        transform: translateX(-5rem);
      }
      .spread-meta {
        color: var(--primary-400);
        font-size: 0.75rem;
      }
      .spread-card h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 400;
      }
      .progress-bar {
        width: 100%;
        height: 0.25rem;
        background: var(--primary-200);
        border-radius: .25rem;
        margin: 0.25rem 0;
      }
      .progress-bar div {
        height: 100%;
        background: var(--color-primary);
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      spread-menu {
        position: fixed;
        left: 0;
        right: 0;
        bottom: max(1rem, env(safe-area-inset-bottom));
      }
    `;
  }

   get template(): string {
    // Scan mode (design p.6): spread menu at the bottom. The spread card links to the /spreads dev view
    // and is shown in dev builds only.
    return /* html */ `
      <div class="content">
        ${import.meta.env.DEV ? '<div class="spread-card"></div>' : ""}
      </div>
      <spread-menu></spread-menu>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    this.spreadId = this.getAttribute("spreadId");
    this.game?.subscribe(this.handleStateChange.bind(this));
    this.setupEventListeners();
    this.updateView();
}

 setupEventListeners() {
    this.shadowRoot?.querySelector('.spread-card')?.addEventListener('click', () => {
        if (this.game) {
            this.game.router.navigate('/spreads');
        }
    });
}

disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange);
    // Clean up event listeners
    this.shadowRoot?.querySelector('.spread-card')?.removeEventListener('click', () => {});
}

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "spread-id" && newValue !== oldValue) {
      this.spreadId = newValue;
      this.updateView();
    }
  }

  private handleStateChange(state: GameState) {
    this.updateView();
  }

  private updateView() {
    assert(this.game, "GameStore not available in updateView");
    assert(this.shadowRoot, "ShadowRoot not available in updateView");

    const cardContainer = this.shadowRoot.querySelector(".spread-card");
    if (!cardContainer) return; // dev only

    console.log("[SpreadPage] spreadId:", this.spreadId)
    if (!this.spreadId) {
      this.spreadId = getInitialSpreadId();
      return;
    }

    this.spread = getSpread(this.spreadId);
    if (!this.spread) {
      console.warn(`Spread not found: ${this.spreadId}`);
      cardContainer.innerHTML = '<div class="error">Spread not found</div>';
      return;
    }
    const completionPercentage = this.game.history.getSpreadCompletionPercentage(this.spreadId) ?? 0;

    cardContainer.innerHTML = /* html */ `
      <div class="spread-icon">📑</div>
      <div class="spread-info">
        <h3>${this.spread.title}</h3>
        <div class="spread-meta">
          <div class="page-range">Pages ${this.spread.firstPage} - ${this.spread.lastPage} <span>(${completionPercentage}%)</span></div>
          <div class="progress-bar">
            <div style="width: ${completionPercentage}%"></div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("spread-page", SpreadPage);
