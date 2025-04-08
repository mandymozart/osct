import { GameStoreService } from "../../services/GameStoreService";
import { GameMode } from "../../types";
import { assert } from "../../utils/assert";

/**
 * Scene Button Component
 * 
 * A button component that toggles between VR and AR modes
 */
export class SceneButton extends HTMLElement {
    private button: HTMLButtonElement | null = null;
    private unsubscribe: (() => void) | null = null;
    private _active = false;
    
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.handleModeChange = this.handleModeChange.bind(this);
        this.handleClick = this.handleClick.bind(this);
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
        this.updateButtonState();
    }

    disconnectedCallback() {
        this.cleanupListeners();
    }

    private render() {
        if (!this.shadowRoot) return;
        
        const activeClass = this._active ? "active" : "";
        
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

                button.active {
                    border-color: var(--color-secondary, #666);
                    background-color: var(--color-accent, #f0f0f0);
                    color: var(--color-secondary, #666);
                    box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
                }
                
                button[disabled] {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            </style>
            <button class="${activeClass}">
                ${this.buttonText}
            </button>
        `;

        this.button = this.shadowRoot.querySelector('button');
    }

    private setupListeners() {
        if (this.button) {
            this.button.addEventListener('click', this.handleClick);
        }
        
        // Get game instance from GameStoreService
        const game = GameStoreService.getInstance().getGame();
        
        // Use assert to ensure game is available
        assert(game, 'Scene Button: Game instance not available from GameStoreService');
        
        this.unsubscribe = game.subscribe(this.handleModeChange);
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

    private handleModeChange(state: { mode: GameMode }) {
        this.updateButtonState();
    }

    private updateButtonState() {
        if (!this.button) return;
        
        const game = GameStoreService.getInstance().getGame();
        assert(game, 'Scene Button: Game instance not available when updating button state');
        
        const isVRMode = game.state.mode === GameMode.VR;
        const isQRMode = game.state.mode === GameMode.QR;
        
        // Update active state
        this._active = isVRMode;
        
        // Disable button in QR mode
        this.button.disabled = isQRMode;
        
        // Update active state and text based on current mode
        this.button.classList.toggle('active', isVRMode);
        
        if (isVRMode) {
            this.button.textContent = 'Exit VR';
            this.button.title = 'Return to AR mode';
        } else if (isQRMode) {
            this.button.textContent = 'VR Unavailable';
            this.button.title = 'Exit QR scanning mode to enter VR';
        } else {
            this.button.textContent = 'Enter VR';
            this.button.title = 'Switch to VR mode';
        }
    }

    private handleClick() {
        const game = GameStoreService.getInstance().getGame();
        assert(game, 'Scene Button: Game instance not available when handling click');
        
        try {
            if (game.state.mode === GameMode.VR) {
                game.scene.exitVR();
            } else if (game.state.mode !== GameMode.QR) {
                game.scene.enterVR();
            }
        } catch (error) {
            console.error('Error toggling VR mode:', error);
        }
    }

    private get buttonText(): string {
        return this.textContent?.trim() || 'Enter VR';
    }
    
    /**
     * Programmatically toggle VR mode
     */
    public toggleVRMode(): void {
        this.handleClick();
    }
}

customElements.define('scene-button', SceneButton);
