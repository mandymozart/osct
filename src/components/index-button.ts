import { GameStore, Pages, Route } from "../store/types";
import { GameStoreService } from "../services/GameStoreService";
import { assert } from "../utils/assert";

/**
 * Index Button Component
 * 
 * A button component that navigates to the index/home page
 */
export class IndexButton extends HTMLElement {
    private button: HTMLButtonElement | null = null;
    private unsubscribe: (() => void) | null = null;
    
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.handleClick = this.handleClick.bind(this);
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
    }

    disconnectedCallback() {
        this.cleanupListeners();
    }

    private render() {
        if (!this.shadowRoot) return;
        
        this.shadowRoot.innerHTML = /* html */ `
            <style>
                :host {
                    display: inline-block;
                }
                
                button {
                    font-weight: 500;
                    color: var(--color-primary, #333);
                    text-decoration: inherit;
                    border-radius: 1em;
                    border: 1px solid var(--color-primary, #333);
                    padding: 0 1em;
                    font-size: 1em;
                    line-height: 2em;
                    font-family: inherit;
                    background-color: var(--color-background, #fff);
                    cursor: pointer;
                    transition: all 0.25s ease;
                }

                button:hover {
                    border-color: var(--color-secondary, #666);
                    color: var(--color-secondary, #666);
                }

                button:focus,
                button:focus-visible {
                    outline: 4px auto -webkit-focus-ring-color;
                }
                
                button[disabled] {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            </style>
            <button title="Go to index page">
                ${this.buttonText}
            </button>
        `;

        this.button = this.shadowRoot.querySelector('button');
    }

    private setupListeners() {
        if (this.button) {
            this.button.addEventListener('click', this.handleClick);
        }
        
        // Get game instance and assert it exists
        const game = GameStoreService.getInstance().getGameStore();
        assert(game, 'Index Button: Game instance not available from GameStoreService');
    }

    private cleanupListeners() {
        if (this.button) {
            this.button.removeEventListener('click', this.handleClick);
        }
        
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    private handleClick() {
        // Get game instance and assert it exists
        const game = GameStoreService.getInstance().getGameStore();
        assert(game, 'Index Button: Game instance not available when handling click');
        
        try {
            // Create a proper Route object with both page and slug properties
            const homeRoute: Route = {
                page: Pages.HOME,
                slug: 'home'
            };
            
            // Navigate to the home/index page
            game.navigate(homeRoute);
        } catch (error) {
            console.error('Error navigating to index page:', error);
        }
    }

    private get buttonText(): string {
        return this.textContent?.trim() || 'Index';
    }
}

customElements.define('index-button', IndexButton);
