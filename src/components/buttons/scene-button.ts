import { GameMode } from "@/types";
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
    return `<span slot="icon">👻</span>`;
  }
  
  protected getButtonText(): string {
    return this._buttonTextContent;
  }

  protected updateButtonState() {
    if (!this.game) return;

    const isSceneMode = this.game.state.mode === GameMode.VR || this.game.state.mode === GameMode.DEFAULT;
    const isQRMode = this.game.state.mode === GameMode.QR;

    // Update active state
    this.active = isSceneMode;
    
    // Disable button in QR mode
    this.disabled = isQRMode;

    // Update text based on current mode
    if (isSceneMode) {
      this._buttonTextContent = "AR";
    } else {
      this._buttonTextContent = "VR";
    }
  }

  protected async handleClick() {
    if (!this.game || this.disabled) return;

    try {     
      await this.game.scene.updateSceneVisibility()
    } catch (error) {
      console.error("Error toggling VR mode:", error);
    }
  }
}

customElements.define("scene-button", SceneButton);
