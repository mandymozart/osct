import { GameMode } from "@/types";
import { BaseNavigationButton } from "./base-navigation-button";

export interface IQRButton extends HTMLElement {
  toggleQRMode(): void;
}

export class QRButton extends BaseNavigationButton implements IQRButton {
  private _buttonTextContent: string = "QR";

  constructor() {
    super();
  }

  protected getButtonIconHTML(): string {
    return `<qr-icon slot="icon"></qr-icon>`;
  }
  
  protected getButtonText(): string {
    return this._buttonTextContent;
  }

  protected updateButtonState() {
    if (!this.game) return;

    const isQRMode = this.game.state.mode === GameMode.QR;
    const isVRMode = this.game.state.mode === GameMode.VR;

    // Update active state
    this.active = isQRMode;
    
    // Disable button in VR mode
    this.disabled = isVRMode;
    
    // Update button text based on current mode
    if (isQRMode) {
      this._buttonTextContent = "AR";
    } else {
      this._buttonTextContent = "QR";
    }
  }

  protected handleClick() {
    if (this._disabled) return;
    this.toggleQRMode();
  }

  /**
   * Toggle QR scanning mode
   */
  public toggleQRMode() {
    if (!this.game) return;
    
    try {
      const isQRMode = this.game.state.mode === GameMode.QR;
      if (isQRMode) {
        // Switch to AR mode
        this.game.qr.stopScanning();
      } else {
        // Switch to QR mode
        this.game.qr.startScanning();
      }
    } catch (error) {
      console.error("Error toggling QR mode:", error);
    }
  }
}

customElements.define("qr-button", QRButton);
