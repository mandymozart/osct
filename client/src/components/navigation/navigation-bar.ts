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

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    assert(this.game, "Navigation Bar: Game instance not available");
    this.render();
    this.unsubscribe = this.game.subscribeToProperty("mode", this.updateVisibility.bind(this));
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
            display: none;
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
            z-index: 0;
            /* Force hardware acceleration */
            -webkit-transform: translateZ(0);
            transform: translateZ(0);
            pointer-events: none;
        }
        
        index-button,
        spreads-button {
            pointer-events: all;
        }
      </style>

      <index-button></index-button>
      <spreads-button></spreads-button>
    `;
  }

  // Dev builds only, in consultation: links to the dev views – the former index (spreads + targets)
  // and /spreads (all spreads). The design has no bottom bar – scan: spread menu, consultation: "Entries" in
  // the top chrome (header.ts).
  private updateVisibility(mode?: GameMode) {
    this.style.display = import.meta.env.DEV && mode === GameMode.CONSULTATION ? 'flex' : 'none';
  }
}

customElements.define("navigation-bar", NavigationBar);
