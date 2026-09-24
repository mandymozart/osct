import { PageRoute, Pages } from "@/types";
import { BaseNavigationButton } from "./base-navigation-button";

/**
 * Spreads Button Component
 *
 * A button component that navigates to the spreads overlay page
 */
export class SpreadsButton extends BaseNavigationButton {
  constructor() {
    super();
  }

  protected getButtonIconHTML(): string {
    return `<span slot="icon">📑</span>`;
  }

  protected getButtonText(): string {
    return this.getAttribute("text") || this.textContent?.trim() || "Spreads";
  }

  protected updateButtonState() {
    if (!this.game) return;

    // Check if the current route is the spreads page
    const isSpreadsPage =
      this.game.state.currentRoute &&
      this.game.state.currentRoute.hasOwnProperty("page") &&
      (this.game.state.currentRoute as PageRoute).page === Pages.SPREADS;

    // Update active state
    this.active = Boolean(isSpreadsPage);
  }

  protected handleClick() {
    try {
      // Navigate to spreads page
      this.game.router.navigate("/spreads");
    } catch (error) {
      console.error("Error navigating to spreads page:", error);
    }
  }
}

customElements.define("spreads-button", SpreadsButton);
