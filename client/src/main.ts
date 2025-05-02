import '@ungap/custom-elements';

import "@/components";
import "@/pages";
import { IErrorPage } from "@/pages/error-page";
import { GameStoreService } from "@/services/GameStoreService";
import {
  IGame,
} from "@/types/";
import { waitForDOMReady } from "./utils/dom";
// Register AFRAME Components
import '@/components/aframe-bridges/components/clickableTarget';

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
  }

  connectedCallback() {
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
      pointer-events: none;

    }
  `;

  template = /* html */ `
    <camera-permission></camera-permission>
    <game-header></game-header>

    <navigation-bar></navigation-bar>
    
    <pages-router>
      <about-page></about-page>
      <chapter-page></chapter-page>
      <chapters-page></chapters-page>
      <home-page></home-page>
      <index-page></index-page>
      <tutorial-page></tutorial-page>
      <not-found-page></not-found-page>
      <error-page></error-page>
    </pages-router>

    <loading-page active></loading-page>

    <static-scene-bridge></static-scene-bridge>
    <target-bridge></target-bridge>
    <app-router></app-router>
    
    <qr-scanner></qr-scanner>

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

  private initializeComponents() {
    this.game.startLoading();
    // TODO: move error handling to centralized error page and game state.
    this.errorPage = this.shadowRoot!.querySelector("error-page");
  }

  private async setupGameState() {
    try {
      await waitForDOMReady();
      window.BOOKGAME = this.game;
      console.log(
        `[BookGame] Initialized version ${this.game.version.version} / ${this.game.version.timestamp}) ID: ${this.game.state.id}`
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    if (this.errorPage) {
      const errorEvent = new CustomEvent("show-error", {
        detail: { message },
      });
      this.errorPage.dispatchEvent(errorEvent);
    }
  }
}

customElements.define("book-game", BookGame);
