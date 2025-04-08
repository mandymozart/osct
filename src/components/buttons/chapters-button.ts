import { GameStoreService } from "@/services/GameStoreService";
import { PageRoute, Pages, Route } from "@/types";
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
                <bf-icon slot="icon"></bf-icon>
                <span class="button-text">${this.buttonText}</span>
            </button>
        `;

        this.button = this.shadowRoot.querySelector('button');
    }

    protected updateButtonState() {
        if (!this.button || !this.game) return;
        
        // Check if the current route is the chapters page
        const isChaptersPage = this.game.state.currentRoute && 
            this.game.state.currentRoute.hasOwnProperty('page') && 
            (this.game.state.currentRoute as PageRoute).page === Pages.CHAPTERS;
        
        // Update active state
        this._active = Boolean(isChaptersPage);
        
        // Chapter button is always enabled
        this._disabled = false;
        
        // Update button appearance
        if (this.button) {
            this.button.classList.toggle('active', this._active);
            this.button.disabled = this._disabled;
        }
    }

    protected handleClick() {
        if (!this.game || this._disabled) return;
        
        try {
            // Navigate to chapters page
            this.game.router.navigate('/chapters');
        } catch (error) {
            console.error("Error navigating to chapters page:", error);
        }
    }

    protected get buttonText(): string {
        return this.getAttribute('text') || this.textContent?.trim() || 'CH';
    }
}

customElements.define("chapters-button", ChaptersButton);
