import { GameStoreService } from "@/services/GameStoreService";
import { CameraPermissionStatus, IGame } from "@/types";
import { Page } from "@/pages/page";

/**
 * Camera Permission component displays an overlay when camera access is required
 * or has been denied, providing appropriate feedback to the user.
 * 
 * The component automatically subscribes to camera permission changes
 * in the game store and updates its UI accordingly.
 */
export class CameraPermission extends Page {
  protected game: Readonly<IGame>;
  private currentPermissionStatus: CameraPermissionStatus;
  private cleanupListener: (() => void) | null = null;
  
  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.currentPermissionStatus = this.game.state.cameraPermission;
    
    // Set initial UI state based on permission state
    if (this.currentPermissionStatus === CameraPermissionStatus.DENIED) {
      this.showDeniedOverlay();
    } else if (this.currentPermissionStatus === CameraPermissionStatus.PROMPT) {
      this.showPromptOverlay();
    } else {
      this.hideOverlay();
    }
    
    this.setupListeners();
  }
  
  connectedCallback() {
    super.connectedCallback();
  }
  
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.cleanupListener) {
      this.cleanupListener();
      this.cleanupListener = null;
    }
  }
  
  protected setupListeners(): void {
    // Listen for permission changes from game store
    this.cleanupListener = this.game.camera.onPermissionChange(this.handlePermissionChange.bind(this));
    // Also subscribe to normal game state changes to catch initial state
    this.game.subscribe(this.handleStateChange.bind(this));
  }
  
  /**
   * Handle game state changes, only updating UI when permission state changes
   */
  protected handleStateChange(state: { cameraPermission: CameraPermissionStatus }) {
    // Only process if permission state has actually changed
    if (state.cameraPermission !== this.currentPermissionStatus) {
      console.log("[CameraPermission] Permission state changed:", this.currentPermissionStatus, "->", state.cameraPermission);
      this.handlePermissionChange(state.cameraPermission);
    }
  }
  
  /**
   * Handle permission change events
   */
  private handlePermissionChange(status: CameraPermissionStatus) {
    this.currentPermissionStatus = status;
    
    switch (status) {
      case CameraPermissionStatus.GRANTED:
        this.hideOverlay();
        break;
      case CameraPermissionStatus.DENIED:
        this.showDeniedOverlay();
        break;
      case CameraPermissionStatus.PROMPT:
        this.showPromptOverlay();
        break;
      default:
        this.hideOverlay();
        break;
    }
  }
  
  protected get styles(): string {
    return /* css */ `
      :host {
        position: absolute;
        border-radius: 0;
        z-index: -1;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: var(--color-background);
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        pointer-events: none; /* Allow clicks to pass through when inactive */
      }
      
      :host([active]) {
        pointer-events: auto; /* Capture clicks when active */
      }
      
      .message {
        font-size: 1.1em;
        color: var(--color-primary);
        padding: 2rem;
        text-align: center;
        max-width: 80%;
        border-radius: 8px;
      }
      
      
      .prompt, .denied {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      }
      
      .hidden {
        display: none;
      }
    `;
  }
  // TODO: BOTH SAME
  private getContent() {
    return /* html */ `
      <div class="prompt ${this.currentPermissionStatus === CameraPermissionStatus.PROMPT ? '' : 'hidden'}">
        <img src="/assets/illustrations/tutorial-step-2.svg" alt="Camera" width="100" height="100">
        <div class="message">Camera access was denied. Please enable camera permissions in your browser settings to use AR features.</div>
      <button is="text-button" inverted id="settings-button">Open Settings</button>
        </div>
      
      <div class="denied ${this.currentPermissionStatus === CameraPermissionStatus.DENIED ? '' : 'hidden'}">
      <img src="/assets/illustrations/tutorial-step-2.svg" alt="Camera" width="100" height="100">
        <div class="message">Camera access was denied. Please enable camera permissions in your browser settings to use AR features.</div>
        <button is="text-button" inverted id="settings-button">Open Settings</button>
      </div>
    `;
  }
  
  protected get template(): string {
    return this.getContent();
  }
  
  private showPromptOverlay(): void {
    console.log("[CameraPermission] Showing prompt overlay");
    this.setAttribute('active', 'true');
    this.render();
    
    // Add event listener to settings button if present
    setTimeout(() => {
      const settingsButton = this.shadowRoot?.querySelector('#settings-button');
      if (settingsButton) {
        settingsButton.addEventListener('click', this.handleSettingsClick.bind(this));
      }
    }, 0);
  }
  
  private showDeniedOverlay(): void {
    console.log("[CameraPermission] Showing denied overlay");
    this.setAttribute('active', 'true');
    this.render();
    
    // Add event listener to settings button if present
    setTimeout(() => {
      const settingsButton = this.shadowRoot?.querySelector('#settings-button');
      if (settingsButton) {
        settingsButton.addEventListener('click', this.handleSettingsClick.bind(this));
      }
    }, 0);
  }
  
  private hideOverlay(): void {
    console.log("[CameraPermission] Hiding overlay");
    this.removeAttribute('active');
    this.render();
  }
  
  private handleSettingsClick(): void {
    this.game.camera.showSettings();
  }
}

customElements.define("camera-permission", CameraPermission);
