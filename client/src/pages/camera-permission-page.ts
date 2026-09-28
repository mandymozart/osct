import { Page } from "./page";
import { GameStoreService } from "@/services";
import { CameraPermissionStatus, GameMode, IGame } from "@/types";
import { detectBrowser, escapeHtml } from "@/utils";
import { t } from "i18next";
import "@/components/common";
import { goldButton } from "@/components/buttons";
import { goToScan } from "@/components/tutorial";
import { adoptDesignStyles } from "@/styles";

/**
 * Camera permission overlay. Has no route: like `loading-page` it sits outside the pages router and is
 * driven by the store (`cameraPermission`). Shown while camera access is being requested or is unavailable;
 * explains how to re-enable it per browser. Uses the onboarding look with a gold camera illustration.
 */
export class CameraPermissionPage extends Page {
  protected game: Readonly<IGame>;
  private currentPermissionStatus: CameraPermissionStatus;
  private cleanupListener: (() => void) | null = null;
  private cleanupModeListener: (() => void) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    adoptDesignStyles(this.shadowRoot);
    this.currentPermissionStatus = this.game.state.cameraPermission;

    this.setOnboarding(this.game.state.mode === GameMode.IDLE);
    if (this.currentPermissionStatus === CameraPermissionStatus.DENIED || this.currentPermissionStatus === CameraPermissionStatus.UNAVAILABLE
      || this.currentPermissionStatus === CameraPermissionStatus.NOT_RESPONDING) {
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
    this.cleanupModeListener?.();
    this.cleanupModeListener = null;
    this.shadowRoot?.removeEventListener("click", this.handleClick);
  }

  setupListeners(): void {
    // Onboarding (idle mode): the overlay covers the page and offers to continue without the camera;
    // in scan mode it stays behind the header and the spread menu
    this.cleanupModeListener = this.game.subscribeToProperty("mode", mode => {
      this.setOnboarding(mode === GameMode.IDLE);
      if (this.hasAttribute("active")) this.render();
    });
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.cleanupListener = this.game.subscribeToProperty(
      'cameraPermission',
      (newStatus, prevStatus) => {
        if (newStatus !== prevStatus) {
          this.handlePermissionChange(newStatus);
        }
      }
    );
  }

  private handlePermissionChange(status: CameraPermissionStatus) {
    this.currentPermissionStatus = status;

    switch (status) {
      case CameraPermissionStatus.GRANTED:
        this.hideOverlay();
        break;
      case CameraPermissionStatus.DENIED:
      case CameraPermissionStatus.UNAVAILABLE:
      case CameraPermissionStatus.NOT_RESPONDING:
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
        pointer-events: none;
      }

      :host([active]) {
        pointer-events: auto;
      }
      .continue { margin-top: 1.5rem; pointer-events: auto; }

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
    return `<gold-illustration src="/assets/illustrations/tutorial-step-2.svg" label="${t("camera:illustration")}"></gold-illustration>`;
  }

  /** Browser-specific steps to allow the camera again */
  private getSettingsInstructions(): string {
    const browser = detectBrowser();
    const which = browser === "chrome" || browser === "firefox" || browser === "safari" ? browser : "other";
    // Steps are numbered keys ("0", "1", …) – i18next-cli keeps lists as objects
    const steps = Object.values(t(`camera:${which}Steps`, { returnObjects: true }) as Record<string, string>)
      .map(step => `<li>${escapeHtml(step)}</li>`)
      .join("");
    return `${t(`camera:${which}Title`)}<ol>${steps}</ol>`;
  }

  private getContent() {
    // Asking (the browser shows its prompt) vs. denied (the reader has to change the setting)
    if (this.currentPermissionStatus === CameraPermissionStatus.PROMPT) {
      return /* html */ `
        ${this.getIcon()}
        <div class="message design gold"><p>${t("camera:waiting")}</p><p>${t("camera:allow")}</p></div>
      `;
    }
    const onboarding = this.game.state.mode === GameMode.IDLE;
    const continueButton = onboarding
      ? goldButton({ label: t("camera:continueWithout"), shape: "button", className: "continue", attrs: { "data-action": "continue" } })
      : "";
    // Access granted, but no picture: reload the page, else restart the browser
    if (this.currentPermissionStatus === CameraPermissionStatus.NOT_RESPONDING) {
      return /* html */ `
        ${this.getIcon()}
        <div class="message design gold">
          <p>${t("camera:notResponding")}</p>
          <p>${t("camera:notRespondingHelp")}</p>
        </div>
        ${goldButton({ label: t("camera:reload"), shape: "button", className: "continue", attrs: { "data-action": "reload" } })}
        ${continueButton}
      `;
    }
    // No camera API (http on a network address): allowing it in the settings would not help
    if (this.currentPermissionStatus === CameraPermissionStatus.UNAVAILABLE) {
      return /* html */ `
        ${this.getIcon()}
        <div class="message design gold"><p>${t("camera:unavailable")}</p></div>
        ${continueButton}
      `;
    }
    return /* html */ `
      ${this.getIcon()}
      <div class="message design gold">
        <p>${t("camera:denied")}</p>
        <p>${t("camera:enable")}</p>
      </div>
      <div class="settings-instructions design muted">
        ${this.getSettingsInstructions()}
      </div>
      ${continueButton}
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

  /** Does not re-render: the overlay fades out with its current content (re-rendering would flash other text) */
  private hideOverlay(): void {
    this.removeAttribute('active');
  }

  /**
   * Onboarding: above the page (otherwise "Grant access" would seem to do nothing); scan mode: behind the
   * header and the spread menu. Set inline because a toggled :host([attribute]) rule is not re-evaluated reliably.
   */
  private setOnboarding(onboarding: boolean) {
    this.toggleAttribute("onboarding", onboarding);
    this.style.zIndex = onboarding ? "2000" : "-1";
  }

  /** "Reload" reloads the app; "Continue" goes on to scan mode without the camera (which shows this screen again behind its chrome) */
  private handleClick = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-action=reload]")) {
      window.location.reload();
      return;
    }
    if (!target.closest("[data-action=continue]")) return;
    goToScan(this.game);
  };
}

customElements.define("camera-permission-page", CameraPermissionPage);
