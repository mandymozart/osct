import { GameStoreService } from "@/services/GameStoreService";
import { GameMode, IGame } from "@/types";
import { assert } from "@/utils";

/**
 * Navigation Bar Component
 *
 * A container for the app's main navigation buttons.
 */
export class NavigationBar extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;
  private currentMode: GameMode | undefined = undefined;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    assert(this.game, "Navigation Bar: Game instance not available");
    this.render();
    this.unsubscribe = this.game.subscribe(this.handleGameStateChange.bind(this));
    this.updateVisibility(this.game.state.mode);
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
            display: flex;
            position: fixed;
            bottom: 1rem;
            left: 1rem;
            right: 1rem;
            gap: 1rem;
            z-index: 1;
        }
        
        qr-button, scene-button, index-button, chapters-button {
            flex: 1;
        }
      </style>
      
      <qr-button></qr-button>
      <index-button></index-button>
    `;
  }

  private handleGameStateChange(state: { mode?: GameMode }) {
    if (this.currentMode !== state.mode) {
      this.currentMode = state.mode;
      this.updateVisibility(state.mode);
    }
  }

  private updateVisibility(mode?: GameMode) {
    this.style.display = mode === GameMode.IDLE ? 'none' : 'flex';
  }
}

customElements.define("navigation-bar", NavigationBar);
