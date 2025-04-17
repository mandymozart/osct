import { GameStoreService } from "@/services/GameStoreService";
import "@/components";
import "@/pages";
import { IErrorPage } from "@/pages/error-page";
import {
  IGame,
} from "@/types/";
import { waitForDOMReady } from "./utils/dom";

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
    }
  `;

  template = /* html */ `
    <game-header></game-header>
    
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
    
    <navigation-bar></navigation-bar>

    <loading-page active></loading-page>

    <scene-bridge></scene-bridge>
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
