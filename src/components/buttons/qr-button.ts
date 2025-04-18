import { GameMode } from "@/types";
import { BaseNavigationButton, IBaseNavigationButton } from "./base-navigation-button";

export interface IQRButton extends IBaseNavigationButton {
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
    this.active = this.isQRMode();
  }

  protected handleClick() {
    this.toggleQRMode();
  }

  /**
   * Toggle QR scanning mode
   */
  private toggleQRMode() {
    try {
      if (this.isQRMode()) {
        // TODO: Does this need to be here or isnt it handled by the gamestate? qr scanner and qr manager?
        this.game.qr.stopScanning();
      } else {
        this.game.qr.startScanning();
      }
    } catch (error) {
      console.error("Error toggling QR mode:", error);
    }
  }

  /**
   * Check if the game is currently in QR mode
   */
  private isQRMode(): boolean {
    return this.game?.state.mode === GameMode.QR;
  }
}

customElements.define("qr-button", QRButton);
