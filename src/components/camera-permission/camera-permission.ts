import { Page } from "@/pages/page";
import { GameStoreService } from "@/services/GameStoreService";
import { CameraPermissionStatus, IGame } from "@/types";
import { detectBrowser } from "@/utils/browser";

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
    this.cleanupListener = this.game.camera.onPermissionChange(this.handlePermissionChange.bind(this));
    this.game.subscribe(this.handleStateChange.bind(this));
  }
  
  /**
   * Handle game state changes, only updating UI when permission state changes
   */
  protected handleStateChange(state: { cameraPermission: CameraPermissionStatus }) {
    if (state.cameraPermission !== this.currentPermissionStatus) {
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
        color: var(--color-primary);
        font-size: 1rem;
        display: flex;
        line-height: 1.5;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        pointer-events: none; /* Allow clicks to pass through when inactive */
        }
        
        :host([active]) {
          pointer-events: auto; /* Capture clicks when active */
        }
        
        .message {
          text-align: center;
          font-size: 1.5rem;
          padding: 2rem;
        }
        .settings-instructions {
          font-size: 1rem;
          padding: 2rem;
          text-align: center;
        }
        ol {
          font-size: 1rem;
          padding: 0;
          text-align: left;
        }
      
    `;
  }
  
  /**
   * Get browser-specific camera permission instructions
   */
  private getSettingsInstructions(): string {
    const browser = detectBrowser();
    switch (browser) {
      case 'chrome':
        return `To enable camera access in Chrome:<br><ol><li>Click the lock icon (🔒) in the address bar</li><li>Select "Site settings"</li><li>Allow camera permissions</li><li>Refresh the page</li></ol>`;
      case 'firefox':
        return `To enable camera access in Firefox:<br><ol><li>Click the lock icon (🔒) in the address bar</li><li>Clear the current setting</li><li>Refresh the page and allow access when prompted</li></ol>`;
      case 'safari':
        return `To enable camera access in Safari:<br><ol><li>Open Safari Preferences</li><li>Go to Websites &gt; Camera</li><li>Find this website and select "Allow"</li><li>Refresh the page</li></ol>`;
      default:
        return `To enable camera access:<br><ol><li>Check your browser settings for camera permissions</li><li>Allow this site to use your camera</li><li>Refresh the page</li></ol>`;
    }
  }

  private getContent() {
    return /* html */ `
      <img src="/assets/illustrations/tutorial-step-2.svg" alt="Camera" width="100" height="100">
      <div class="message">Camera access was denied.<br />Please enable camera permissions in your browser settings to use AR features.</div>
      <div class="settings-instructions">
        ${this.getSettingsInstructions()}
      </div>
    `;
  }
  
  protected get template(): string {
    return this.getContent();
  }
  
  private showPromptOverlay(): void {
    this.setAttribute('active', 'true');
    this.render();
  }
  
  private showDeniedOverlay(): void {
    this.setAttribute('active', 'true');
    this.render();
  }
  
  private hideOverlay(): void {
    this.removeAttribute('active');
    this.render();
  }
}

customElements.define("camera-permission", CameraPermission);
