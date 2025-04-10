import { PageRoute, Pages } from "@/types";
import { BaseNavigationButton } from "./base-navigation-button";

/**
 * Chapters Button Component
 *
 * A button component that navigates to the chapters overlay page
 */
export class ChaptersButton extends BaseNavigationButton {
  constructor() {
    super();
  }

  protected getButtonIconHTML(): string {
    return `<span slot="icon">📑</span>`;
  }

  protected getButtonText(): string {
    return this.getAttribute("text") || this.textContent?.trim() || "Chapters";
  }

  protected updateButtonState() {
    if (!this.game) return;

    // Check if the current route is the chapters page
    const isChaptersPage =
      this.game.state.currentRoute &&
      this.game.state.currentRoute.hasOwnProperty("page") &&
      (this.game.state.currentRoute as PageRoute).page === Pages.CHAPTERS;

    // Update active state
    this.active = Boolean(isChaptersPage);

    // Chapter button is always enabled
    this.disabled = false;
  }

  protected handleClick() {
    if (!this.game || this.disabled) return;

    try {
      // Navigate to chapters page
      this.game.router.navigate("/chapters");
    } catch (error) {
      console.error("Error navigating to chapters page:", error);
    }
  }
}

customElements.define("chapters-button", ChaptersButton);
