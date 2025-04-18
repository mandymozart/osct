import { GameStoreService } from "@/services/GameStoreService";
import { GameMode, IGame, PageRoute, Pages } from "@/types";
import { assert } from "@/utils";

/**
 * Navigation Bar Component
 *
 * A container for the app's main navigation buttons.
 * Manages the state and interactions between buttons.
 */
export class NavigationBar extends HTMLElement {
  private game: Readonly<IGame>;
  private unsubscribe: (() => void) | null = null;

  // Button references
  private qrButton: HTMLElement | null = null;
  private sceneButton: HTMLElement | null = null;
  private indexButton: HTMLElement | null = null;
  private chaptersButton: HTMLElement | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    this.handleGameStateChange = this.handleGameStateChange.bind(this);
  }

  connectedCallback() {
    assert(this.game, "Navigation Bar: Game instance not available");

    this.render();
    this.setupListeners();
    this.updateButtonStates();
  }

  disconnectedCallback() {
    this.cleanupListeners();
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
            <scene-button></scene-button>
            <index-button></index-button>
            <chapters-button></chapters-button>
        `;
  }

  private setupListeners() {
    // Get button references
    const shadowRoot = this.shadowRoot;
    if (!shadowRoot) return;

    this.qrButton = shadowRoot.querySelector("qr-button");
    this.sceneButton = shadowRoot.querySelector("scene-button");
    this.indexButton = shadowRoot.querySelector("index-button");
    this.chaptersButton = shadowRoot.querySelector("chapters-button");

    // Check if all required buttons are present
    if (
      !this.qrButton ||
      !this.sceneButton ||
      !this.indexButton ||
      !this.chaptersButton
    ) {
      console.error("Navigation Bar: Missing required buttons");
      return;
    }

    // Subscribe to game state changes
    if (this.game) {
      this.unsubscribe = this.game.subscribe(this.handleGameStateChange);
    }
  }

  private cleanupListeners() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private handleGameStateChange() {
    this.updateButtonStates();
  }

  private updateButtonStates() {
    if (
      !this.game ||
      !this.qrButton ||
      !this.sceneButton ||
      !this.indexButton ||
      !this.chaptersButton
    )
      return;

    const { mode, currentRoute } = this.game.state;

    // Mode-based states
    const isSceneMode = mode === GameMode.VR || mode === GameMode.DEFAULT;
    const isQRMode = mode === GameMode.QR;

    // Route-based states (check if the currentRoute has a page property with the right value)
    const isIndexPage =
      currentRoute &&
      currentRoute.hasOwnProperty("page") &&
      (currentRoute as PageRoute).page === Pages.INDEX;
    const isChaptersPage =
      currentRoute &&
      currentRoute.hasOwnProperty("page") &&
      (currentRoute as PageRoute).page === Pages.CHAPTERS;

    // QR and Scene buttons are mutually exclusive
    // QR button is disabled in VR and DEFAULT mode, Scene button is disabled in QR mode
    (this.sceneButton as any).disabled = isSceneMode;
    (this.qrButton as any).disabled = isQRMode;

    // Set active states based on game mode for QR and Scene buttons
    (this.sceneButton as any).active = isSceneMode;
    (this.qrButton as any).active = isQRMode;

    // Index and Chapters buttons can both be active based on current route
    (this.indexButton as any).active = Boolean(isIndexPage);
    (this.chaptersButton as any).active = Boolean(isChaptersPage);
  }
}

customElements.define("navigation-bar", NavigationBar);
