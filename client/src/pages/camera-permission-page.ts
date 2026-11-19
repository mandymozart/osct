import { Page } from "./page";
import { GameStoreService } from "@/services";
import { CameraPermissionStatus, GameMode, type IGame } from "@/types";
import { t } from "i18next";
import "@/components/common";
import { goldButton } from "@/components/buttons";
import { goToScan } from "@/components/tutorial";
import { adoptDesignStyles } from "@/styles";
import { ONBOARDING_ICON_SRC } from "@/utils/static-splash-html";

/**
 * Camera permission overlay. Has no route: like `loading-page` it sits outside the pages router and is
 * driven by the store (`cameraPermission`). Shown while camera access is being requested or is unavailable;
 * explains how to re-enable it per browser. Uses the onboarding look: during onboarding on its vertical grid (the
 * icon in row 1, the text from row 3, the buttons from row 5 – DESIGN.md §3a, design p. 13); in scan mode the
 * message alone between the header and the scene menu. No camera illustration since the design review (#281).
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
      || this.currentPermissionStatus === CameraPermissionStatus.NOT_RESPONDING || this.currentPermissionStatus === CameraPermissionStatus.UNSUPPORTED) {
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
    // in scan mode it stays behind the header and the scene menu
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
      case CameraPermissionStatus.UNSUPPORTED:
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
        --text-line: var(--text-line-loose);
      }

      :host([active]) {
        pointer-events: auto;
      }
      :host(:not([onboarding])) {
        box-sizing: border-box;
        padding: var(--consultation-top) 0 calc(max(1rem, env(safe-area-inset-bottom)) + 5.5rem);
      }
      /* Onboarding: the grid of tutorial-content (DESIGN.md §3a), scrolling when a long text does not fit */
      :host([onboarding]) {
        justify-content: flex-start;
        box-sizing: border-box;
        padding: var(--grid-top) 0 var(--grid-bottom);
        overflow-y: auto;
      }
      .row {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: none;
        width: 100%;
        height: var(--grid-row);
      }
      img[data-icon] {
        width: var(--onboarding-icon-width);
        height: var(--onboarding-icon-height);
        margin-top: max(0px, calc(var(--grid-row) * var(--onboarding-icon-centre) - var(--onboarding-icon-height) / 2));
        object-fit: contain;
      }
      .head {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: none;
        width: 100%;
        min-height: calc(2 * var(--grid-row));
        padding-bottom: 1.5rem;
        box-sizing: border-box;
      }
      .actions { display: flex; flex-direction: column; align-items: center; flex: none; }
      .actions .continue + .continue { margin-top: 1.5rem; }
      :host(:not([onboarding])) .actions { margin-top: 1.5rem; }
      .continue { pointer-events: auto; }

      .message { max-width: 17rem; padding: 0 1.5rem; }
      .message p { margin: 0 0 1em; }
    `;
  }

  /** Message and buttons for the current status; onboarding places them on the grid below the icon */
  private getContent(): string {
    const { message, actions = "" } = this.getParts();
    if (!this.hasAttribute("onboarding")) {
      return `<div class="message design gold">${message}</div>${actions ? `<div class="actions">${actions}</div>` : ""}`;
    }
    return /* html */ `
      <div class="row"><img src="${ONBOARDING_ICON_SRC}" alt="" data-icon></div>
      <div class="row"></div>
      <div class="head"><div class="message design gold">${message}</div></div>
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    `;
  }

  private getParts(): { message: string; actions?: string } {
    const paragraphs = (...texts: string[]) => texts.map(text => `<p>${text}</p>`).join("");
    const reload = goldButton({ label: t("camera:reload"), shape: "button", className: "continue", attrs: { "data-action": "reload" } });
    // Asking (the browser shows its prompt) vs. denied (the reader has to change the setting)
    if (this.currentPermissionStatus === CameraPermissionStatus.PROMPT) {
      return { message: paragraphs(t("camera:waiting"), t("camera:allow")) };
    }
    const onboarding = this.game.state.mode === GameMode.IDLE;
    const continueButton = onboarding
      ? goldButton({ label: t("camera:continueWithout"), shape: "button", className: "continue", attrs: { "data-action": "continue" } })
      : "";
    // Access granted, but no picture: reload the page, else restart the browser
    if (this.currentPermissionStatus === CameraPermissionStatus.NOT_RESPONDING) {
      return { message: paragraphs(t("camera:notResponding"), t("camera:notRespondingHelp")), actions: reload + continueButton };
    }
    // The browser cannot run the image tracking: update iOS (if the phone can) or the browser
    if (this.currentPermissionStatus === CameraPermissionStatus.UNSUPPORTED) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      return { message: paragraphs(t("camera:unsupported"), t(ios ? "camera:unsupportedIos" : "camera:unsupportedOther")), actions: continueButton };
    }
    // No camera API (http on a network address): allowing it in the settings would not help
    if (this.currentPermissionStatus === CameraPermissionStatus.UNAVAILABLE) {
      return { message: paragraphs(t("camera:unavailable")), actions: continueButton };
    }
    return { message: paragraphs(t("camera:denied"), t("camera:enable")), actions: reload + continueButton };
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
   * header and the scene menu. Set inline because a toggled :host([attribute]) rule is not re-evaluated reliably.
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
