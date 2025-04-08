import { GameStoreService } from "@/services/GameStoreService";
import { Pages } from "@/types";
import { BaseNavigationButton } from "./base-navigation-button";

/**
 * Index Button Component
 * 
 * A button component that navigates to the index overlay page
 */
export class IndexButton extends BaseNavigationButton {
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
        <index-icon slot="icon"></index-icon>
        <span class="button-text">${this.buttonText}</span>
      </button>
    `;

    this.button = this.shadowRoot.querySelector('button');
  }

  protected updateButtonState() {
    if (!this.button || !this.game) return;
    
    // Check if the current route is the index page
    const isIndexPage = this.game.state.currentRoute && 
      this.game.state.currentRoute.hasOwnProperty('page') && 
      (this.game.state.currentRoute as any).page === Pages.INDEX;
    
    // Update active state
    this._active = Boolean(isIndexPage);
    
    // Index is disabled when no current chapter is available
    this._disabled = !this.game.state.currentChapter;
    
    // Update button appearance
    if (this.button) {
      this.button.classList.toggle('active', this._active);
      this.button.disabled = this._disabled;
    }
  }

  protected handleClick() {
    if (!this.game || this._disabled) return;
    
    try {
      // Navigate to index page
      this.game.router.navigate('/index');
    } catch (error) {
      console.error("Error navigating to index page:", error);
    }
  }

  protected get buttonText(): string {
    return this.getAttribute('text') || this.textContent?.trim() || 'IX';
  }
}

customElements.define("index-button", IndexButton);
