import { GameStoreService } from "@/services/GameStoreService";
import { IGame, GameMode } from "@/types";
import { BaseNavigationButton } from "./base-navigation-button";

export interface IQRButton extends HTMLElement {
  toggleQRMode(): void;
}

export class QRButton extends BaseNavigationButton implements IQRButton {
  constructor() {
    super();
  }

  protected render() {
    if (!this.shadowRoot) return;
    
    const activeClass = this._active ? "active" : "";
    const disabledAttr = this._disabled ? "disabled" : "";
    
    this.shadowRoot.innerHTML = /* html */ `
        <style>
            :host {
                display: inline-block;
            }
        </style>
        <button is="text-button" class="${activeClass}" ${disabledAttr} size="sm">
            <qr-icon slot="icon"></qr-icon>
            <span class="button-text">${this.buttonText}</span>
        </button>
    `;

    this.button = this.shadowRoot.querySelector('button');
  }

  protected updateButtonState() {
    if (!this.button || !this.game) return;

    const isQRMode = this.game.state.mode === GameMode.QR;
    const isVRMode = this.game.state.mode === GameMode.VR;

    // Update active state
    this._active = isQRMode;
    
    // Disable button in VR mode
    this._disabled = isVRMode;
    
    if (this.button) {
      // Update button appearance
      this.button.classList.toggle('active', this._active);
      this.button.disabled = this._disabled;
      
      // Update button text based on current mode
      const textSpan = this.button.querySelector('.button-text');
      if (textSpan) {
        if (isQRMode) {
          textSpan.textContent = "AR";
        } else if (isVRMode) {
          textSpan.textContent = "QR";
        } else {
          textSpan.textContent = "QR";
        }
      }
    }
  }

  protected handleClick() {
    if (!this.game || this._disabled) return;

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

  protected get buttonText(): string {
    return this.getAttribute('text') || this.textContent?.trim() || 'QR';
  }

  /**
   * Programmatically toggle QR scanning mode
   */
  public toggleQRMode(): void {
    this.handleClick();
  }
}

customElements.define("qr-button", QRButton);
