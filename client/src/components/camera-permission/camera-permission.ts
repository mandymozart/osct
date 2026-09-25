import { Page } from "@/pages/page";
import { GameStoreService } from "@/services/GameStoreService";
import { CameraPermissionStatus, IGame } from "@/types";
import { detectBrowser } from "@/utils/browser";
import "@/components/common/gold-illustration";
import { adoptDesignStyles } from "@/styles/design-styles";

/**
 * Camera Permission component displays an overlay when camera access is required
 * or has been denied, providing appropriate feedback to the user.
 *
 * The component automatically subscribes to camera permission changes
 * in the game store and updates its UI accordingly.
 *
 * Styled after the onboarding (design p.4 "Grant access" – no own frame): onboarding background, gold
 * text, the camera illustration in gold chrome with a sweeping highlight (`<gold-illustration>`).
 */
export class CameraPermission extends Page {
  protected game: Readonly<IGame>;
  private currentPermissionStatus: CameraPermissionStatus;
  private cleanupListener: (() => void) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    adoptDesignStyles(this.shadowRoot);
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

  setupListeners(): void {
    this.cleanupListener = this.game.subscribeToProperty(
      'cameraPermission',
      (newStatus, prevStatus) => {
        if (newStatus !== prevStatus) {
          this.handlePermissionChange(newStatus);
        }
      }
    );
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

  get styles(): string {
    return /* css */ `
      :host {
        position: absolute;
        border-radius: 0;
        box-shadow: none;
        z-index: -1;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--onboarding-background);
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        text-align: center;
        pointer-events: none; /* Allow clicks to pass through when inactive */
      }

      :host([active]) {
        pointer-events: auto; /* Capture clicks when active */
      }

      gold-illustration { width: 5.5rem; margin-bottom: 2rem; }

      .message { max-width: 17rem; padding: 0 1.5rem; }
      .message p { margin: 0 0 1em; }

      .settings-instructions {
        max-width: 17rem;
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: var(--rule);
        font-size: var(--text-size-small);
        text-align: left;
      }
      ol { margin: .5rem 0 0; padding-left: 1.2rem; }
      li { margin: .2rem 0; }
    `;
  }

  private getIcon(): string {
    return `<gold-illustration src="/assets/illustrations/tutorial-step-2.svg" label="Camera"></gold-illustration>`;
  }

  /**
   * Get browser-specific camera permission instructions
   */
  private getSettingsInstructions(): string {
    const browser = detectBrowser();
    switch (browser) {
      case 'chrome':
        return `To enable camera access in Chrome:<ol><li>Tap the lock / settings icon in the address bar</li><li>Select "Site settings"</li><li>Allow camera permissions</li><li>Refresh the page</li></ol>`;
      case 'firefox':
        return `To enable camera access in Firefox:<ol><li>Tap the lock icon in the address bar</li><li>Clear the current setting</li><li>Refresh the page and allow access when prompted</li></ol>`;
      case 'safari':
        return `To enable camera access in Safari:<ol><li>Open the page settings ("aA" in the address bar) or Safari settings</li><li>Go to Websites &gt; Camera</li><li>Find this website and select "Allow"</li><li>Refresh the page</li></ol>`;
      default:
        return `To enable camera access:<ol><li>Check your browser settings for camera permissions</li><li>Allow this site to use your camera</li><li>Refresh the page</li></ol>`;
    }
  }

  private getContent() {
    // Asking (the browser shows its prompt) vs. denied (the reader has to change the setting)
    if (this.currentPermissionStatus === CameraPermissionStatus.PROMPT) {
      return /* html */ `
        ${this.getIcon()}
        <div class="message design gold"><p>Waiting for camera access…</p><p>Please allow the camera to scan the book.</p></div>
      `;
    }
    return /* html */ `
      ${this.getIcon()}
      <div class="message design gold">
        <p>Camera access was denied.</p>
        <p>To scan the book and display interactive content, please enable camera permissions in your browser settings.</p>
      </div>
      <div class="settings-instructions design muted">
        ${this.getSettingsInstructions()}
      </div>
    `;
  }

  get template(): string {
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
