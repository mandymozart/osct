import { GameStoreService } from "@/services/GameStoreService";
import jsQR from "jsqr";
import { assert } from "@/utils";
import { GameMode, IGame, IQRScanner } from "@/types";

/**
 * QR Scanner Web Component
 *
 * A web component that provides QR code scanning functionality.
 * It uses the device camera to scan QR codes and integrates with
 * the game's QR manager. This component is attached to the document body.
 */
export class QRScanner extends HTMLElement implements IQRScanner {
  // Element IDs for preventing conflicts with A-Frame and MindAR
  private readonly VIDEO_ID = "qr-scanner-video";
  private readonly CANVAS_ID = "qr-scanner-canvas";
  private readonly CONTAINER_CLASS = "qr-scanner-container";
  private readonly OVERLAY_CLASS = "qr-scanner-overlay";
  private readonly MESSAGE_CLASS = "qr-scanner-message";
  private readonly CLOSE_BTN_CLASS = "qr-scanner-close-button";

  // Game store reference
  private game: Readonly<IGame>;

  // Camera and scanning state
  private scanningActive = false;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasContext: CanvasRenderingContext2D | null = null;
  private messageElement: HTMLDivElement | null = null;

  // Resource cleanup
  private unsubscribe: (() => void) | null = null;
  private animationFrameId: number | null = null;
  private stream: MediaStream | null = null;

  constructor() {
    super();
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
    // Add the CSS styles
    const style = document.createElement('style');
    style.textContent = `
      qr-scanner {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.01);
        backdrop-filter: blur(10px);
        z-index: 1;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: var(--color-primary);
        font-family: sans-serif;
      }

      qr-scanner.active {
        display: flex;
      }

      .${this.CONTAINER_CLASS} {
        position: relative;
        width: 100%;
        height: 100%;
      }

      #${this.VIDEO_ID} {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      #${this.CANVAS_ID} {
        display: blocm;
      }

      .${this.OVERLAY_CLASS} {
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
        height: 0.5rem;
        background-color: var(--color-secondary);
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

      .${this.MESSAGE_CLASS} {
        text-align: center;
        font-size: 1rem;
        max-width: 80%;
        padding: 1rem;
      }
    `;

    // Create and append HTML elements
    this.innerHTML = `
      <div class="${this.CONTAINER_CLASS}">
        <video id="${this.VIDEO_ID}" playsinline></video>
        <canvas id="${this.CANVAS_ID}"></canvas>
        <div class="${this.OVERLAY_CLASS}">
          <div class="scanner-line"></div>
        </div>
      </div>
      
      <div class="${this.MESSAGE_CLASS}">
        Position a QR code within the frame to scan
      </div>
    `;

    // Append the style to the document head if not already present
    const styleId = 'qr-scanner-style';
    if (!document.head.querySelector(`style#${styleId}`)) {
      style.id = styleId;
      document.head.appendChild(style);
    }
  }

  /**
   * Initialize component elements and event handlers
   */
  private initializeElements() {
    this.videoElement = document.getElementById(this.VIDEO_ID) as HTMLVideoElement;
    this.canvasElement = document.getElementById(this.CANVAS_ID) as HTMLCanvasElement;
    this.canvasContext = this.canvasElement?.getContext("2d") || null;
    this.messageElement = this.querySelector(`.${this.MESSAGE_CLASS}`) as HTMLDivElement;

    // Set up close button
    const closeButton = this.querySelector(`.${this.CLOSE_BTN_CLASS}`);
    closeButton?.addEventListener("click", () => {
      if (this.game) {
        this.game.qr.stopScanning();
      }
    });

    // Set up video element
    if (this.videoElement && this.canvasElement) {
      // Set canvas dimensions to match video when metadata is loaded
      this.videoElement.addEventListener("loadedmetadata", () => {
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
      console.warn("QR Scanner: Game instance not available");
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
    assert(this.game, "GameStore is missing");
    assert(state, "Game mode needs to be set in a state");

    const isQRMode = state.mode === GameMode.QR;

    // Toggle visibility based on mode
    this.classList.toggle("active", isQRMode);

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
        video: { facingMode: "environment" },
      });

      // Set video source and play
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      // Start scanning
      this.scanningActive = true;
      this.animationFrameId = requestAnimationFrame(this.scanQRCode);

      // Update message
      if (this.messageElement) {
        this.messageElement.textContent = "Position a QR code within the frame to scan";
      }
    } catch (error) {
      console.error("Error accessing camera:", error);

      // Show error message
      if (this.messageElement) {
        this.messageElement.textContent = "Camera access denied. Please enable camera permissions.";
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
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.scanningActive = false;
  }

  /**
   * Process video frames to detect QR codes
   */
  private scanQRCode() {
    if (
      !this.scanningActive ||
      !this.videoElement ||
      !this.canvasElement ||
      !this.canvasContext
    ) {
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
        0,
        0,
        this.canvasElement.width,
        this.canvasElement.height
      );

      // Get image data for QR processing
      const imageData = this.canvasContext.getImageData(
        0,
        0,
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
      if (this.messageElement) {
        this.messageElement.textContent = `QR Code detected: ${data}`;
      }

      // Create a custom event to notify the QR manager
      const qrEvent = new CustomEvent("qr-code-scanned", {
        detail: { data },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(qrEvent);

      // Try to handle the QR code directly
      // This is a fallback in case the event doesn't work
      if (data.startsWith("chapter:")) {
        const chapterId = data.split(":")[1];
        const confirmed = confirm(`Navigate to Chapter ${chapterId}?`);
        if (confirmed) {
          this.game.chapters.switchChapter(chapterId);
        }
      }

      // Exit QR mode after successful scan
      setTimeout(() => {
        if (this.game) {
          this.game.qr.stopScanning();
        }
      }, 1500);
    } catch (error) {
      console.error("Error processing QR code:", error);

      // Show error message
      if (this.messageElement) {
        this.messageElement.textContent = "Invalid QR code format. Please try again.";
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

    const closeButton = this.querySelector(`.${this.CLOSE_BTN_CLASS}`);
    closeButton?.removeEventListener("click", () => {});
  }
}

customElements.define("qr-scanner", QRScanner);
