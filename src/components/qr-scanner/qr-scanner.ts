import { GameStoreService } from "@/services/GameStoreService";
import jsQR from "jsqr";
import { GameMode, IGame, IQRScanner, QRScanEvent, QRScanEventDetail } from "@/types";

/**
 * QR Scanner Web Component
 *
 * A web component that provides QR code scanning functionality.
 * It uses the device camera to scan QR codes and integrates with
 * the game's QR manager.
 */
export class QRScanner extends HTMLElement implements IQRScanner {
  // Game store reference
  private game: Readonly<IGame>;

  // Camera and scanning state
  private scanningActive = false;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private message: HTMLDivElement | null = null;

  // Resource cleanup
  private unsubscribe: (() => void) | null = null;
  private animationFrameId: number | null = null;
  private stream: MediaStream | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.game = GameStoreService.getInstance();
    
    // Bind methods to maintain 'this' context
    this.handleModeChange = this.handleModeChange.bind(this);
    this.scanQRCode = this.scanQRCode.bind(this);
    this.onCodeScanned = this.onCodeScanned.bind(this);
  }

  /**
   * Called when the element is added to the DOM
   */
  public connectedCallback() {
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
    
    // Define styles
    const styles = `
      :host {
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: -1;
        -webkit-box-orient: vertical;
        -webkit-flex-direction: column;
        flex-direction: column;
        -webkit-box-pack: center;
        -webkit-justify-content: center;
        justify-content: center;
        -webkit-box-align: center;
        -webkit-align-items: center;
        align-items: center;
        color: var(--color-primary);
        
        /* active state management */
        pointer-events: none;
        -webkit-transition: opacity .2s linear;
        transition: opacity .2s linear;
        opacity: 0;
        /* Force hardware acceleration */
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
      }

      :host(.active) {
        pointer-events: all;
        opacity: 1;
        z-index: 10000;
      }

      #qr-scanner-video {
        width: 100%;
        height: 100%;
        -webkit-object-fit: cover;
        object-fit: cover;
        display: none;
        /* iOS video positioning */
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1;
      }

      #qr-scanner-canvas {
        display: none;
      }

      .qr-scanner-message {
        text-align: center;
        font-size: 1rem;
        max-width: 80%;
        padding: 1rem;
        color: white;
        position: relative;
        z-index: 2;
      }

      .info {
        display: -webkit-box;
        display: -webkit-flex;
        display: flex;
        -webkit-box-orient: vertical;
        -webkit-flex-direction: column;
        flex-direction: column;
        -webkit-box-align: center;
        -webkit-align-items: center;
        align-items: center;
        gap: 1rem;
        position: absolute;
        bottom: 1rem;
        z-index: 3;
      }

      /* iOS Safari flex gap fallback for older versions */
      .info > * {
        margin: 0.5rem 0;
      }
      
      button {
        
      }
    `;

    // Create HTML template for shadow DOM
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>

      <video id="qr-scanner-video" playsinline></video>
      <canvas id="qr-scanner-canvas"></canvas>
      <qr-square-window-overlay></qr-square-window-overlay>
      <div class="info">

      <div class="qr-scanner-message">
        Position a QR code within the frame to scan
        </div>
      <button is="text-button" inverted id="qr-scanner-close-button">Cancel</button>
      </div>
        
    `;
  }

  /**
   * Initialize component elements and event handlers
   */
  private initializeElements() {
    if (!this.shadowRoot) return;
    
    this.video = this.shadowRoot.getElementById("qr-scanner-video") as HTMLVideoElement;
    this.canvas = this.shadowRoot.getElementById("qr-scanner-canvas") as HTMLCanvasElement;
    this.canvasCtx = this.canvas?.getContext("2d") || null;
    this.message = this.shadowRoot.querySelector(".qr-scanner-message") as HTMLDivElement;

    // Set up close button
    const closeButton = this.shadowRoot.querySelector("#qr-scanner-close-button");
    if (closeButton) {
      closeButton.addEventListener("click", () => {
        if (this.game) {
          this.game.qr.stopScanning();
        }
      });
    }

    // Set up video element
    if (this.video && this.canvas) {
      // Set canvas dimensions to match video when metadata is loaded
      this.video.addEventListener("loadedmetadata", () => {
        if (this.canvas && this.video) {
          this.canvas.width = this.video.videoWidth;
          this.canvas.height = this.video.videoHeight;
        }
      });
    }
  }

  /**
   * Set up event listeners for game state changes
   */
  private setupListeners() {
    // Subscribe to game state changes to handle mode changes
    this.unsubscribe = this.game.subscribe((state: { mode?: GameMode }) => {
      if ('mode' in state && state.mode !== undefined) {
        this.handleModeChange(state.mode);
      }
    });

    // Check initial state
    this.handleModeChange(this.game.state.mode);
  }

  /**
   * Handle game mode changes
   */
  private handleModeChange(mode: GameMode) {
    const isQRMode = mode === GameMode.QR;
    
    // Toggle visibility based on mode
    this.classList.toggle("active", isQRMode);
    
    // Start or stop camera based on mode
    if (isQRMode && !this.scanningActive) {
      console.log("[QR Scanner] activate qr mode");
      this.startCamera();
    } else if (!isQRMode && this.scanningActive) {
      console.log("[QR Scanner] deactivate qr mode");
      this.stopCamera();
    }
  }

  /**
   * Start the camera and begin QR scanning
   */
  public async startCamera() {
    if (!this.video || !this.canvas || this.scanningActive) {
      return;
    }

    try {
      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      // Set video source and play
      this.video.srcObject = this.stream;
      await this.video.play();

      // Start scanning
      this.scanningActive = true;
      this.animationFrameId = requestAnimationFrame(this.scanQRCode);

      // Update message
      if (this.message) {
        this.message.textContent = "Position a QR code within the frame to scan";
      }
    } catch (error) {
      console.error("Error accessing camera:", error);

      // Show error message
      if (this.message) {
        this.message.textContent = "Camera access denied. Please enable camera permissions.";
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
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Clear video source
    if (this.video) {
      this.video.srcObject = null;
    }

    this.scanningActive = false;
  }

  /**
   * Process video frames to detect QR codes
   */
  private scanQRCode() {
    if (
      !this.scanningActive ||
      !this.video ||
      !this.canvas ||
      !this.canvasCtx
    ) {
      return;
    }

    // Check if video has enough data to process
    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      // Set canvas dimensions to match video
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      // Draw video frame to canvas
      this.canvasCtx.drawImage(
        this.video,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

      // Get image data for QR processing
      const imageData = this.canvasCtx.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height
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
      if (this.message) {
        this.message.textContent = `QR Code detected: ${data}`;
      }

      // Directly notify QR manager
      this.game.qr.handleQRCodeScanned(data);

      // Pause scanning briefly to prevent multiple scans
      setTimeout(() => {
        // If still in QR mode, resume scanning
        if (this.game.state.mode === GameMode.QR) {
          this.animationFrameId = requestAnimationFrame(this.scanQRCode);
        }
      }, 1500);
    } catch (error) {
      console.error("Error processing QR code:", error);

      // Show error message
      if (this.message) {
        this.message.textContent = "Invalid QR code format. Please try again.";
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

    if (this.shadowRoot) {
      const closeButton = this.shadowRoot.querySelector(".qr-scanner-close-button");
      closeButton?.removeEventListener("click", () => {});
    }
  }
}

customElements.define("qr-scanner", QRScanner);
