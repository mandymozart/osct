import '@ungap/custom-elements';
// First: i18next is set up before any module translates (also at import time)
import "@/i18n";

import "@/components";
import "@/pages";
import { IErrorPage } from "@/pages";
import { FeedbackService, GameStoreService, LinkService } from "@/services";
import {
  ErrorInfo,
  IGame,
} from "@/types";
import { waitForDOMReady } from "@/utils";
import { getConfigurationError } from "@/utils/game-config";
import i18next from "i18next";
import { DEFAULT_LANGUAGE } from "@/i18n";

// Language of the page (screen readers, hyphenation) and the initial loader's text (index.html)
document.documentElement.lang = i18next.resolvedLanguage ?? DEFAULT_LANGUAGE;
const loaderText = document.querySelector("#initial-loader .visually-hidden");
if (loaderText) loaderText.textContent = i18next.t("common:loadingBook");

// Detect iOS Safari for compatibility fixes
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Add class to document root for CSS targeting
if (isIOS || isSafari) {
  document.documentElement.classList.add('ios-device');
  console.log('[BookGame] iOS/Safari detected, applying compatibility fixes');
}

export class BookGame extends HTMLElement {
  private game: Readonly<IGame>;
  private errorPage: IErrorPage | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    FeedbackService.getInstance().start(); // sounds + vibration (tap on buttons, audio unlock)
  }

  connectedCallback() {
    // Startup check: an invalid game configuration must not start the app (no scene, no camera)
    const configurationError = getConfigurationError();
    if (configurationError) {
      this.renderCriticalError(configurationError);
      return;
    }

    this.render();
    this.initializeComponents();
    this.setupGameState();
  }

  styles = /* css */ `
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }
  `;

  template = /* html */ `
    <camera-permission-page></camera-permission-page>
    <game-header></game-header>

    <pages-router>
      <about-page></about-page>
      <spread-page></spread-page>
      <splash-page></splash-page>
      <entries-page></entries-page>
      <entry-page></entry-page>
      <tutorial-page></tutorial-page>
      <not-found-page></not-found-page>
      <error-page></error-page>
    </pages-router>

    <loading-page active></loading-page>

    <ar-bridge></ar-bridge>
    
    <debug-overlay></debug-overlay>
  `;

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
    <style>
      ${this.styles}
    </style>
    ${this.template}
  `;
  }

  /**
   * Full-screen error when the app cannot start. Uses no pages or store, which depend on content.
   */
  private renderCriticalError(error: ErrorInfo) {
    if (!this.shadowRoot) return;
    const details: string[] = import.meta.env.DEV && Array.isArray(error.details) ? error.details : [];
    const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        ${this.styles}
        :host {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--app-background, #000);
          color: var(--color-on-dark, #fff);
          font-family: inherit;
        }
        .critical-error { max-width: 36rem; padding: 2rem; }
        h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
        .code { opacity: .6; font-size: .8rem; }
        ul { font-family: monospace; font-size: .75rem; padding-left: 1rem; }
      </style>
      <div class="critical-error" role="alert">
        <h1>${escape(error.msg)}</h1>
        <div class="code">${escape(error.code)}</div>
        ${details.length ? `<ul>${details.map(d => `<li>${escape(d)}</li>`).join("")}</ul>` : ""}
      </div>
    `;
    // hideInitialLoader is defined on DOMContentLoaded (index.html)
    waitForDOMReady().then(() => window.hideInitialLoader?.());
    console.error(`[BookGame] Not started: ${error.code}`);
  }

  private initializeComponents() {
    this.game.startLoading();
    // TODO: move error handling to centralized error page and game state.
    this.errorPage = this.shadowRoot!.querySelector("error-page");
  }

  private async setupGameState() {
    try {
      await waitForDOMReady();
      window.BOOKGAME = this.game;
      // The requested view opens directly (a link, or the page reloaded) – no resume prompt.
      // Plain start: first visit → onboarding (skip / finish marks it done), else home.
      const links = LinkService.getInstance();
      if (!links.openIncomingLink(this.game) && !this.game.state.progress.onboarded) {
        this.game.router.navigate("/tutorial", { key: "step", value: "0" });
      }
      // Converted or reset progress is told once, over the opened view
      this.game.history.reportLoadStatus();
      // From now on the address bar follows the state
      links.startSync(this.game);
      console.log(
        `[BookGame] Initialized version ${this.game.version.version} / ${this.game.version.timestamp}) ID: ${this.game.state.id}`
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    const message =
      error instanceof Error ? error.message : i18next.t("startup:unknownError");
    if (this.errorPage) {
      const errorEvent = new CustomEvent("show-error", {
        detail: { message },
      });
      this.errorPage.dispatchEvent(errorEvent);
    }
  }
}

customElements.define("book-game", BookGame);
