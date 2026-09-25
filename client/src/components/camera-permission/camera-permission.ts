import { Page } from "@/pages/page";
import { GameStoreService } from "@/services/GameStoreService";
import { CameraPermissionStatus, IGame } from "@/types";
import { detectBrowser } from "@/utils/browser";
import { CAMERA_PATH, CAMERA_VIEWBOX } from "./camera-icon";

/**
 * Camera Permission component displays an overlay when camera access is required
 * or has been denied, providing appropriate feedback to the user.
 *
 * The component automatically subscribes to camera permission changes
 * in the game store and updates its UI accordingly.
 *
 * Styled after the onboarding (design p.4 "Grant access" – no own frame): black vignette, gold text,
 * the camera icon in gold "chrome" with a sweeping highlight (skeleton-loader style) in the SVG.
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
        background: radial-gradient(ellipse at 50% 45%, #000 45%, #151515 100%);
        color: var(--color-accent);
        font-family: var(--font-design);
        letter-spacing: var(--tracking-design);
        font-size: .85rem;
        line-height: 1.4;
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

      .icon { width: 5.5rem; height: auto; margin-bottom: 2rem; }

      .message {
        max-width: 17rem;
        padding: 0 1.5rem;
      }
      .message p { margin: 0 0 1em; }

      .settings-instructions {
        max-width: 17rem;
        margin-top: 1.5rem;
        padding: 1rem 1.25rem;
        border-top: 1px solid var(--gold-800);
        color: var(--gold-300);
        font-size: .75rem;
        text-align: left;
      }
      ol { margin: .5rem 0 0; padding-left: 1.2rem; }
      li { margin: .2rem 0; }
    `;
  }

  /**
   * Camera icon in gold "chrome": a metallic gold gradient plus a light band that sweeps across it
   * (like a skeleton-loader shimmer). Built inline so the gold scale (CSS variables) reaches the
   * gradient stops; no sweep with reduced motion.
   */
  private getIcon(): string {
    const [, , width] = CAMERA_VIEWBOX.split(" ").map(Number);
    const [x] = CAMERA_VIEWBOX.split(" ").map(Number);
    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = (offset: string, color: string) => `<stop offset="${offset}" style="stop-color: var(${color})"/>`;
    return /* html */ `
      <svg class="icon" viewBox="${CAMERA_VIEWBOX}" role="img" aria-label="Camera">
        <defs>
          <linearGradient id="gold-chrome" x1="0" y1="0" x2="0.35" y2="1">
            ${stop("0", "--gold-300")}${stop("0.35", "--gold-600")}${stop("0.55", "--gold-200")}${stop("0.8", "--gold-700")}${stop("1", "--gold-500")}
          </linearGradient>
          <linearGradient id="gold-sweep" gradientUnits="userSpaceOnUse" x1="${x}" y1="0" x2="${x + width}" y2="0" gradientTransform="translate(-${width} 0)">
            <stop offset="0.35" stop-color="#fff" stop-opacity="0"/>
            ${stop("0.5", "--gold-100")}
            <stop offset="0.65" stop-color="#fff" stop-opacity="0"/>
            ${reduceMotion ? "" : `<animateTransform attributeName="gradientTransform" type="translate" from="-${width} 0" to="${width} 0" dur="1.8s" repeatCount="indefinite"/>`}
          </linearGradient>
        </defs>
        <path d="${CAMERA_PATH}" fill="url(#gold-chrome)"/>
        <path d="${CAMERA_PATH}" fill="url(#gold-sweep)" opacity=".85"/>
      </svg>
    `;
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
        <div class="message"><p>Waiting for camera access…</p><p>Please allow the camera to scan the book.</p></div>
      `;
    }
    return /* html */ `
      ${this.getIcon()}
      <div class="message">
        <p>Camera access was denied.</p>
        <p>To scan the book and display interactive content, please enable camera permissions in your browser settings.</p>
      </div>
      <div class="settings-instructions">
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
