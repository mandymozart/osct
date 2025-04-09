import { GameStoreService } from "@/services/GameStoreService";
import { IGame, GameMode } from "@/types";
import { BaseNavigationButton } from "./base-navigation-button";

/**
 * Scene Button Component
 * 
 * A button component that toggles between VR and AR modes
 */
export class SceneButton extends BaseNavigationButton {
  private _buttonTextContent: string = "VR";

  constructor() {
    super();
  }

  protected getButtonIconHTML(): string {
    return `<ghost-icon slot="icon"></ghost-icon>`;
  }
  
  protected getButtonText(): string {
    return this._buttonTextContent;
  }

  protected updateButtonState() {
    if (!this.game) return;

    const isQRMode = this.game.state.mode === GameMode.QR;
    const isVRMode = this.game.state.mode === GameMode.VR;

    // Update active state
    this.active = isVRMode;
    
    // Disable button in QR mode
    this.disabled = isQRMode;

    // Update text based on current mode
    if (isVRMode) {
      this._buttonTextContent = "AR";
    } else {
      this._buttonTextContent = "VR";
    }
  }

  protected handleClick() {
    if (!this.game || this.disabled) return;

    try {
      const isVRMode = this.game.state.mode === GameMode.VR;
      
      if (isVRMode) {
        // Switch to AR mode
        this.game.scene.exitVR();
      } else {
        // Switch to VR mode
        this.game.scene.enterVR();
      }
    } catch (error) {
      console.error("Error toggling VR mode:", error);
    }
  }
}

customElements.define("scene-button", SceneButton);
