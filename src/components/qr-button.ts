import { GameMode, GameStore } from "../store";

export class QRButton extends HTMLElement {
    private button: HTMLButtonElement | null = null;
    private unsubscribe: (() => void) | null = null;
    
    /* @ts-ignore */
    private game: GameStore = window.game;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.handleModeChange = this.handleModeChange.bind(this);
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
        this.shadowRoot!.innerHTML = /* html */ `
            <style>
                button {
                    font-weight: 500;
                    color: var(--color-primary);
                    text-decoration: inherit;
                    border-radius: 1em;
                    border: 1px solid var(--color-primary);
                    padding: 0 1em;
                    font-size: 1em;
                    line-height: 2em;
                    font-family: inherit;
                    background-color: var(--color-background);
                    cursor: pointer;
                    transition: all 0.25s ease;
                }

                button:hover {
                    border-color: var(--color-secondary);
                    color: var(--color-secondary);
                }

                button:focus,
                button:focus-visible {
                    outline: 4px auto -webkit-focus-ring-color;
                }

                button.active {
                    border-color: var(--color-secondary);
                    background-color: var(--color-background);
                    color: var(--color-secondary);
                }
            </style>
            <button>
                ${this.buttonText}
            </button>
        `;

        this.button = this.shadowRoot!.querySelector('button');
        this.updateButtonState();
    }

    private setupListeners() {
        this.button?.addEventListener('click', this.handleClick);
        this.unsubscribe = this.game.subscribe(this.handleModeChange);
    }

    private cleanupListeners() {
        this.button?.removeEventListener('click', this.handleClick);
        this.unsubscribe?.();
    }

    private handleModeChange(state: { mode: GameMode }) {
        this.updateButtonState();
    }

    private updateButtonState() {
        if (!this.button) return;
        
        const isQRMode = this.game.state.mode === GameMode.QR;
        this.button.classList.toggle('active', isQRMode);
        this.button.textContent = isQRMode ? 'Return to AR' : 'Scan QR Code';
    }

    private handleClick() {
        if (this.game.state.mode === GameMode.QR) {
            this.game.stopQRScanning();
        } else {
            this.game.startQRScanning();
        }
    }

    private get buttonText(): string {
        return this.textContent?.trim() || 'Scan QR Code';
    }
}

customElements.define('qr-button', QRButton);