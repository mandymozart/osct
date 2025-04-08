import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types";
import { assert } from "@/utils";

/**
 * Base class for navigation buttons
 * Provides common functionality and styling for navigation buttons
 */
export abstract class BaseNavigationButton extends HTMLElement {
    protected button: HTMLButtonElement | null = null;
    protected unsubscribe: (() => void) | null = null;
    protected game: IGame | null = null;
    protected _active = false;
    protected _disabled = false;
    
    // Bound methods
    private boundHandleClick: (e: Event) => void;
    private boundHandleStateChange: () => void;
    
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        // Bind methods once in constructor and store references
        this.boundHandleClick = this.handleClick.bind(this);
        this.boundHandleStateChange = this.handleStateChange.bind(this);
    }

    connectedCallback() {
        // Get game instance from GameStoreService
        this.game = GameStoreService.getInstance().getGame();
        assert(this.game, `${this.constructor.name}: Game instance not available`);
        
        this.render();
        this.setupListeners();
        this.updateButtonState();
    }

    disconnectedCallback() {
        this.cleanupListeners();
    }

    /**
     * Render button template
     */
    protected render() {
        if (!this.shadowRoot) return;
        
        const activeClass = this._active ? "active" : "";
        const disabledAttr = this._disabled ? "disabled" : "";
        
        this.shadowRoot.innerHTML = /* html */ `
            <style>
                :host {
                    display: inline-block;
                    width: 100%;
                }
                
                button[is="text-button"] {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                }
                
                button[is="text-button"].active {
                    background-color: var(--color-accent, #f0f0f0);
                    box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
                }
                
                ::slotted(*) {
                    width: 1.2em;
                    height: 1.2em;
                    margin-right: 0.5em;
                }
                
                @media (max-width: 600px) {
                    button[is="text-button"] {
                        padding: 0 0.5em;
                    }
                    
                    .button-text {
                        display: none;
                    }
                    
                    ::slotted(*) {
                        
                    }
                }
            </style>
            <button is="text-button" class="${activeClass}" ${disabledAttr} size="sm">
                <slot name="icon"></slot>
                <span class="button-text">${this.buttonText}</span>
            </button>
        `;

        this.button = this.shadowRoot.querySelector('button');
    }

    /**
     * Set up event listeners
     */
    protected setupListeners() {
        if (this.button) {
            this.button.addEventListener('click', this.boundHandleClick);
        }
        
        if (this.game) {
            this.unsubscribe = this.game.subscribe(this.boundHandleStateChange);
        }
    }

    /**
     * Clean up event listeners
     */
    protected cleanupListeners() {
        if (this.button) {
            this.button.removeEventListener('click', this.boundHandleClick);
        }
        
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    /**
     * Handle game state changes
     */
    protected handleStateChange() {
        this.updateButtonState();
    }

    /**
     * Update button state based on game state
     * Should be implemented by subclasses
     */
    protected abstract updateButtonState(): void;

    /**
     * Handle button click
     * Should be implemented by subclasses
     */
    protected abstract handleClick(): void;

    /**
     * Get button text
     */
    protected get buttonText(): string {
        return this.getAttribute('text') || this.textContent?.trim() || '';
    }
    
    /**
     * Set button active state
     */
    set active(value: boolean) {
        this._active = value;
        if (this.button) {
            this.button.classList.toggle('active', value);
        }
    }
    
    /**
     * Set button disabled state
     */
    set disabled(value: boolean) {
        this._disabled = value;
        if (this.button) {
            this.button.disabled = value;
        }
    }
}
