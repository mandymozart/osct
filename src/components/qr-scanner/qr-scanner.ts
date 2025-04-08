import { GameStoreService } from '../services/GameStoreService';
import jsQR from 'jsqr';
import { assert } from '../utils/assert';
import { GameMode, IGame, IQRScanner } from '../types';

/**
 * QR Scanner Web Component
 * 
 * A web component that provides QR code scanning functionality.
 * It uses the device camera to scan QR codes and integrates with
 * the game's QR manager.
 */
export class QRScanner extends HTMLElement implements IQRScanner {
    // Game store reference
    private game: IGame | null = null;
    
    // Camera and scanning state
    private scanningActive = false;
    private videoElement: HTMLVideoElement | null = null;
    private canvasElement: HTMLCanvasElement | null = null;
    private canvasContext: CanvasRenderingContext2D | null = null;
    private overlayElement: HTMLDivElement | null = null;
    
    // Resource cleanup
    private unsubscribe: (() => void) | null = null;
    private animationFrameId: number | null = null;
    private stream: MediaStream | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        // Bind methods to maintain 'this' context
        this.handleModeChange = this.handleModeChange.bind(this);
        this.scanQRCode = this.scanQRCode.bind(this);
        this.onCodeScanned = this.onCodeScanned.bind(this);
    }

    /**
     * Called when the element is added to the DOM
     */
    public connectedCallback() {        
        // Get game instance from GameStoreService
        this.game = GameStoreService.getInstance().getGame();
        
        this.render();
        this.initializeElements();
        this.setupListeners();
    }

    /**
     * Called when the element is removed from the DOM
     */
    public disconnectedCallback() {
        this.cleanupResources();
    }

    /**
     * Render the component's HTML structure
     */
    private render() {
        if (!this.shadowRoot) return;
        
        this.shadowRoot.innerHTML = /* html */`
            <style>
                :host {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: var(--color-primary);
                    z-index: 1000;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    color: white;
                    font-family: sans-serif;
                }

                :host(.active) {
                    display: flex;
                }

                .scanner-container {
                margin-top: 2rem;
                    position: relative;
                    width: 12rem;
                    max-width: 12rem;
                    height: 12rem;
                    max-height: 12rem;
                    aspect-ratio: 1 / 1;
                    border-radius: 1rem;
                    overflow: hidden;
                    background: var(--color-background);
                }

                video {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                canvas {
                    display: none;
                }

                .scanner-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 1rem;
                    box-sizing: border-box;
                    pointer-events: none;
                }

                .scanner-line {
                    position: absolute;
                    width: 100%;
                    height: 2px;
                    background-color: rgba(0, 255, 0, 0.5);
                    top: 50%;
                    left: 0;
                    transform: translateY(-50%);
                    animation: scan 2s linear infinite;
                }

                @keyframes scan {
                    0% {
                        top: 10%;
                    }
                    50% {
                        top: 90%;
                    }
                    100% {
                        top: 10%;
                    }
                }

                .message {
                    text-align: center;
                    font-size: 1rem;
                    max-width: 80%;
                    padding: 1rem;
                }

                .close-button {
                    position: absolute;
                    top: 2rem;
                    right: 2rem;
                    background: none;
                    border: none;
                    color: white;
                    font-size: 1.5rem;
                    cursor: pointer;
                    opacity: 0.7;
                    transition: opacity 0.3s;
                    z-index: 1001;
                }

                .close-button:hover {
                    opacity: 1;
                }
            </style>

            <button class="close-button" aria-label="Close QR Scanner">×</button>
            
            <div class="scanner-container">
                <video playsinline></video>
                <canvas></canvas>
                <div class="scanner-overlay">
                    <div class="scanner-line"></div>
                </div>
            </div>
            
            <div class="message">
                Position a QR code within the frame to scan
            </div>
        `;
    }

    /**
     * Initialize component elements and event handlers
     */
    private initializeElements() {
        if (!this.shadowRoot) return;
        
        this.videoElement = this.shadowRoot.querySelector('video');
        this.canvasElement = this.shadowRoot.querySelector('canvas');
        this.canvasContext = this.canvasElement?.getContext('2d') || null;
        this.overlayElement = this.shadowRoot.querySelector('.scanner-overlay');
        
        // Set up close button
        const closeButton = this.shadowRoot.querySelector('.close-button');
        closeButton?.addEventListener('click', () => {
            if (this.game) {
                this.game.qr.stopScanning();
            }
        });
        
        // Set up video element
        if (this.videoElement && this.canvasElement) {
            // Set canvas dimensions to match video when metadata is loaded
            this.videoElement.addEventListener('loadedmetadata', () => {
                if (this.canvasElement && this.videoElement) {
                    this.canvasElement.width = this.videoElement.videoWidth;
                    this.canvasElement.height = this.videoElement.videoHeight;
                }
            });
        }
    }

    /**
     * Set up event listeners for game state changes
     */
    private setupListeners() {
        if (!this.game) {
            console.warn('QR Scanner: Game instance not available');
            return;
        }
        
        // Subscribe to game state changes
        this.unsubscribe = this.game.subscribe(this.handleModeChange);
        
        // Check initial state
        this.handleModeChange({ mode: this.game.state.mode });
    }

    /**
     * Handle game mode changes
     */
    private handleModeChange(state: { mode: GameMode }) {
        assert(this.game, 'GameStore is missing')
        assert(state, 'Game mode needs to be set in a state')
        
        const isQRMode = state.mode === GameMode.QR;
        
        // Toggle visibility based on mode
        this.classList.toggle('active', isQRMode);
        
        if (isQRMode && !this.scanningActive) {
            this.startCamera();
        } else if (!isQRMode && this.scanningActive) {
            this.stopCamera();
        }
    }

    /**
     * Start the camera and begin QR scanning
     */
    public async startCamera() {
        if (!this.videoElement || !this.canvasElement || this.scanningActive) {
            return;
        }
        
        try {
            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            
            // Set video source and play
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();
            
            // Start scanning
            this.scanningActive = true;
            this.animationFrameId = requestAnimationFrame(this.scanQRCode);
            
            // Update message
            const messageElement = this.shadowRoot?.querySelector('.message');
            if (messageElement) {
                messageElement.textContent = 'Position a QR code within the frame to scan';
            }
        } catch (error) {
            console.error('Error accessing camera:', error);
            
            // Show error message
            const messageElement = this.shadowRoot?.querySelector('.message');
            if (messageElement) {
                messageElement.textContent = 'Camera access denied. Please enable camera permissions.';
            }
        }
    }

    /**
     * Stop the camera and QR scanning
     */
    public stopCamera() {
        if (!this.scanningActive) return;
        
        // Stop animation frame
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Stop all camera tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        // Clear video source
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        
        this.scanningActive = false;
    }

    /**
     * Process video frames to detect QR codes
     */
    private scanQRCode() {
        if (!this.scanningActive || !this.videoElement || !this.canvasElement || !this.canvasContext) {
            return;
        }
        
        // Check if video has enough data to process
        if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
            // Set canvas dimensions to match video
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
            
            // Draw video frame to canvas
            this.canvasContext.drawImage(
                this.videoElement,
                0, 0,
                this.canvasElement.width,
                this.canvasElement.height
            );
            
            // Get image data for QR processing
            const imageData = this.canvasContext.getImageData(
                0, 0,
                this.canvasElement.width,
                this.canvasElement.height
            );
            
            // Process with jsQR
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            
            if (code) {
                // Valid QR code found
                this.onCodeScanned(code.data);
                return; // Stop scanning after finding a code
            }
        }
        
        // Continue scanning
        this.animationFrameId = requestAnimationFrame(this.scanQRCode);
    }

    /**
     * Handle a successfully scanned QR code
     */
    private onCodeScanned(data: string) {
        if (!this.game) return;
        
        try {
            // Provide visual feedback
            const messageElement = this.shadowRoot?.querySelector('.message');
            if (messageElement) {
                messageElement.textContent = `QR Code detected: ${data}`;
            }
            
            // Create a custom event to notify the QR manager
            const qrEvent = new CustomEvent('qr-code-scanned', {
                detail: { data },
                bubbles: true,
                composed: true
            });
            this.dispatchEvent(qrEvent);
            
            // Try to handle the QR code directly
            // This is a fallback in case the event doesn't work
            if (data.startsWith('chapter:')) {
                const chapterId = data.split(':')[1];
                const confirmed = confirm(`Navigate to Chapter ${chapterId}?`);
                if (confirmed) {
                    this.game.chapters.switchChapter(chapterId);
                }
            }
            
            // Exit QR mode after successful scan
            setTimeout(() => {
                if (this.game) {
                    this.game.qr.stopQRScanning();
                }
            }, 1500);
        } catch (error) {
            console.error('Error processing QR code:', error);
            
            // Show error message
            const messageElement = this.shadowRoot?.querySelector('.message');
            if (messageElement) {
                messageElement.textContent = 'Invalid QR code format. Please try again.';
            }
            
            // Resume scanning after error
            this.animationFrameId = requestAnimationFrame(this.scanQRCode);
        }
    }

    /**
     * Clean up resources when component is removed
     */
    private cleanupResources() {
        this.stopCamera();
        
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        
        const closeButton = this.shadowRoot?.querySelector('.close-button');
        closeButton?.removeEventListener('click', () => {});
    }
}

customElements.define('qr-scanner', QRScanner);
