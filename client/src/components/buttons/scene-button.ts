import { GameMode } from "@/types";
import { BaseNavigationButton, IBaseNavigationButton } from "./base-navigation-button";

interface ISceneButton extends IBaseNavigationButton {
  readonly buttonTextContent?: string;
}

/**
 * Scene Button Component
 * 
 * A button component that toggles between VR and AR modes
 */
export class SceneButton extends BaseNavigationButton implements ISceneButton {
  private _buttonTextContent: string = "AR";

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
    this.active = isSceneMode;
  }

  protected async handleClick() {
    try {     
      await this.game.scene.updateSceneVisibility()
    } catch (error) {
      console.error("Error toggling VR mode:", error);
    }
  }
}

customElements.define("scene-button", SceneButton);
