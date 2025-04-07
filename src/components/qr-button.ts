import { GameStoreService } from "../services/GameStoreService";
import { IGame, GameMode } from "../types";

export interface IQRButton extends HTMLElement {
  toggleQRMode(): void;
}

export class QRButton extends HTMLElement implements IQRButton {
  private button: HTMLButtonElement | null = null;
  private unsubscribe: (() => void) | null = null;

  // Game store reference
  private game: IGame | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.handleModeChange = this.handleModeChange.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    // Get game instance from GameStoreService
    this.game = GameStoreService.getInstance().getGame();

    this.render();
    this.setupListeners();
  }

  disconnectedCallback() {
    this.cleanupListeners();
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = /* html */ `
            <style>
                :host {
                    display: inline-block;
                }
            </style>
            <button is="text-button">
                ${this.buttonText}
            </button>
        `;

    this.button = this.shadowRoot.querySelector("button");
    this.updateButtonState();
  }

  private setupListeners() {
    if (this.button) {
      this.button.addEventListener("click", this.handleClick);
    }

    if (this.game) {
      this.unsubscribe = this.game.subscribe(this.handleModeChange);
    } else {
      console.warn(
        "QR Button: Game instance not available from GameStoreService"
      );
      if (this.button) {
        this.button.disabled = true;
        this.button.title = "QR scanning not available";
      }
    }
  }

  private cleanupListeners() {
    if (this.button) {
      this.button.removeEventListener("click", this.handleClick);
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private handleModeChange(state: { mode: GameMode }) {
    this.updateButtonState();
  }

  private updateButtonState() {
    if (!this.button || !this.game) return;

    const isQRMode = this.game.state.mode === GameMode.QR;
    const isVRMode = this.game.state.mode === GameMode.VR;

    // Disable button in VR mode
    this.button.disabled = isVRMode;

    // Update active state and text based on current mode
    this.button.classList.toggle("active", isQRMode);

    if (isQRMode) {
      this.button.textContent = "Return to AR";
      this.button.title = "Exit QR scanning mode";
    } else if (isVRMode) {
      this.button.textContent = "QR Unavailable in VR";
      this.button.title = "Exit VR mode to scan QR codes";
    } else {
      this.button.textContent = "Scan QR Code";
      this.button.title = "Scan a QR code to navigate to a chapter";
    }
  }

  private handleClick() {
    if (!this.game) return;

    try {
      if (this.game.state.mode === GameMode.QR) {
        this.game.qr.stopScanning();
      } else if (this.game.state.mode !== GameMode.VR) {
        this.game.qr.startScanning();
      }
    } catch (error) {
      console.error("Error toggling QR scanning mode:", error);
    }
  }

  private get buttonText(): string {
    return this.textContent?.trim() || "Scan QR Code";
  }

  /**
   * Programmatically toggle QR scanning mode
   */
  public toggleQRMode(): void {
    this.handleClick();
  }
}

customElements.define("qr-button", QRButton);
