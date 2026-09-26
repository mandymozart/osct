import { Page } from "./page";
import { GameStoreService } from "@/services";
import { CameraPermissionStatus, IGame } from "@/types";
import { detectBrowser, escapeHtml } from "@/utils";
import i18next from "i18next";
import "@/components/common";
import { adoptDesignStyles } from "@/styles";

/**
 * Camera permission overlay – no route: like `loading-page` it sits outside the pages router and is
 * driven by the store (`cameraPermission`). Shown when camera access is required or was denied.
 *
 * Styled after the onboarding (design p.4 "Grant access" – no own frame): onboarding background, gold
 * text, the camera illustration in gold chrome with a sweeping highlight (`<gold-illustration>`).
 */
export class CameraPermissionPage extends Page {
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
    return `<gold-illustration src="/assets/illustrations/tutorial-step-2.svg" label="${i18next.t("camera:illustration")}"></gold-illustration>`;
  }

  /**
   * Browser-specific steps to allow the camera again
   */
  private getSettingsInstructions(): string {
    const browser = detectBrowser();
    const which = browser === "chrome" || browser === "firefox" || browser === "safari" ? browser : "other";
    // Steps are numbered keys ("0", "1", …) – i18next-cli keeps lists as objects
    const steps = Object.values(i18next.t(`camera:${which}Steps`, { returnObjects: true }) as Record<string, string>)
      .map(step => `<li>${escapeHtml(step)}</li>`)
      .join("");
    return `${i18next.t(`camera:${which}Title`)}<ol>${steps}</ol>`;
  }

  private getContent() {
    // Asking (the browser shows its prompt) vs. denied (the reader has to change the setting)
    if (this.currentPermissionStatus === CameraPermissionStatus.PROMPT) {
      return /* html */ `
        ${this.getIcon()}
        <div class="message design gold"><p>${i18next.t("camera:waiting")}</p><p>${i18next.t("camera:allow")}</p></div>
      `;
    }
    return /* html */ `
      ${this.getIcon()}
      <div class="message design gold">
        <p>${i18next.t("camera:denied")}</p>
        <p>${i18next.t("camera:enable")}</p>
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

customElements.define("camera-permission-page", CameraPermissionPage);
