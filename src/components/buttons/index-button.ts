import { GameStoreService } from "@/services/GameStoreService";
import { PageRoute, Pages } from "@/types";
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

  protected getButtonIconHTML(): string {
    return `<index-icon slot="icon"></index-icon>`;
  }
  
  protected getButtonText(): string {
    return this.getAttribute('text') || this.textContent?.trim() || 'Index';
  }

  protected updateButtonState() {
    if (!this.game) return;
    
    // Check if the current route is the index page
    const isIndexPage = this.game.state.currentRoute && 
      this.game.state.currentRoute.hasOwnProperty('page') && 
      (this.game.state.currentRoute as PageRoute).page === Pages.INDEX;
    
    // Update active state
    this.active = Boolean(isIndexPage);
  }

  protected handleClick() {
    if (!this.game || this.disabled) return;
    
    try {
      // Navigate to index page
      this.game.router.navigate('/index');
    } catch (error) {
      console.error("Error navigating to index page:", error);
    }
  }
}

customElements.define("index-button", IndexButton);
