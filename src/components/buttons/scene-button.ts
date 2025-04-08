import { GameStoreService } from "@/services/GameStoreService";
import { IGame, GameMode } from "@/types";
import { BaseNavigationButton } from "./base-navigation-button";

/**
 * Scene Button Component
 * 
 * A button component that toggles between VR and AR modes
 */
export class SceneButton extends BaseNavigationButton {
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
        <ghost-icon slot="icon"></ghost-icon>
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
    this._active = isVRMode;
    
    // Disable button in QR mode
    this._disabled = isQRMode;

    // Update button appearance
    if (this.button) {
      this.button.classList.toggle("active", this._active);
      this.button.disabled = this._disabled;
      
      // Update text based on current mode
      const textSpan = this.button.querySelector('.button-text');
      if (textSpan) {
        if (isVRMode) {
          textSpan.textContent = "AR";
        } else if (isQRMode) {
          textSpan.textContent = "VR";
        } else {
          textSpan.textContent = "VR";
        }
      }
    }
  }

  protected handleClick() {
    if (!this.game || this._disabled) return;

    if (this.game.state.mode === GameMode.VR) {
      this.game.scene.exitVR();
    } else if (this.game.state.mode !== GameMode.QR) {
      this.game.scene.enterVR();
    }
  }

  protected get buttonText(): string {
    return this.getAttribute('text') || this.textContent?.trim() || 'VR';
  }
}

customElements.define("scene-button", SceneButton);
