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
            display: -webkit-box;
            display: -webkit-flex;
            display: flex;
            -webkit-box-align: center;
            -webkit-align-items: center;
            align-items: center;
            -webkit-box-pack: center;
            -webkit-justify-content: center;
            justify-content: center;
            position: fixed;
            bottom: 1rem;
            left: 1rem;
            right: 1rem;
            gap: 1rem;
            z-index: 1;
            /* Force hardware acceleration */
            -webkit-transform: translateZ(0);
            transform: translateZ(0);
            pointer-events: none;
        }
        
        qr-button, index-button {
            pointer-events: all;
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
