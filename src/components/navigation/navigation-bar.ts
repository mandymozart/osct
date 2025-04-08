import { GameStoreService } from "@/services/GameStoreService";
import { GameMode, Pages } from "@/types";
import { assert } from "@/utils";

/**
 * Navigation Bar Component
 * 
 * A container for the app's main navigation buttons.
 * Manages the state and interactions between buttons.
 */
export class NavigationBar extends HTMLElement {
    private game = GameStoreService.getInstance().getGame();
    private unsubscribe: (() => void) | null = null;
    
    // Button references
    private qrButton: HTMLElement | null = null;
    private sceneButton: HTMLElement | null = null;
    private indexButton: HTMLElement | null = null;
    private chaptersButton: HTMLElement | null = null;
    
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.handleGameStateChange = this.handleGameStateChange.bind(this);
    }

    connectedCallback() {
        assert(this.game, 'Navigation Bar: Game instance not available');
        
        this.render();
        this.setupListeners();
        this.updateButtonStates();
    }

    disconnectedCallback() {
        this.cleanupListeners();
    }

    private render() {
        if (!this.shadowRoot) return;
        
        this.shadowRoot.innerHTML = /* html */ `
            <style>
                :host {
                    display: flex;
                    position: fixed;
                    bottom: 1rem;
                    left: 1rem;
                    right: 1rem;
                    gap: 1rem;
                    z-index: 1;
                }
                
                qr-button, scene-button, index-button, chapters-button {
                    flex: 1;
                }
                
                @media (max-width: 600px) {
                    :host {
                        padding: 0.5rem;
                    }
                }
            </style>
            
            <qr-button></qr-button>
            <scene-button></scene-button>
            <index-button></index-button>
            <chapters-button></chapters-button>
        `;
    }

    private setupListeners() {
        // Get button references
        const shadowRoot = this.shadowRoot;
        if (!shadowRoot) return;
        
        this.qrButton = shadowRoot.querySelector('qr-button');
        this.sceneButton = shadowRoot.querySelector('scene-button');
        this.indexButton = shadowRoot.querySelector('index-button');
        this.chaptersButton = shadowRoot.querySelector('chapters-button');
        
        // Check if all required buttons are present
        if (!this.qrButton || !this.sceneButton || !this.indexButton || !this.chaptersButton) {
            console.error('Navigation Bar: Missing required buttons');
            return;
        }
        
        // Subscribe to game state changes
        if (this.game) {
            this.unsubscribe = this.game.subscribe(this.handleGameStateChange);
        }
    }

    private cleanupListeners() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    private handleGameStateChange() {
        this.updateButtonStates();
    }

    private updateButtonStates() {
        if (!this.game || !this.qrButton || !this.sceneButton || !this.indexButton || !this.chaptersButton) return;
        
        const { mode, currentRoute, currentChapter } = this.game.state;
        
        // Mode-based states
        const isQRMode = mode === GameMode.QR;
        const isVRMode = mode === GameMode.VR;
        
        // Route-based states (check if the currentRoute has a page property with the right value)
        const isIndexPage = currentRoute && currentRoute.hasOwnProperty('page') && 
                           (currentRoute as any).page === Pages.INDEX;
        const isChaptersPage = currentRoute && currentRoute.hasOwnProperty('page') && 
                              (currentRoute as any).page === Pages.CHAPTERS;
        
        // QR and Scene buttons are mutually exclusive
        // QR button is disabled in VR mode, Scene button is disabled in QR mode
        this.qrButton.classList.toggle('disabled', isVRMode);
        this.sceneButton.classList.toggle('disabled', isQRMode);
        
        // Index and Chapters buttons can both be active based on current route
        this.indexButton.classList.toggle('active', Boolean(isIndexPage));
        this.chaptersButton.classList.toggle('active', Boolean(isChaptersPage));
        
        // Index button is disabled when no chapter is loaded
        this.indexButton.classList.toggle('disabled', !currentChapter);
    }
}

customElements.define('navigation-bar', NavigationBar);
