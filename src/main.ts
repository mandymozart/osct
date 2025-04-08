import { ILoadingPage } from "./pages/loading-page";
import {
  ChapterResource,
  GameMode,
  IPagesRouter,
  Route,
  LoadingState,
} from "@/types";
import { Scene } from "aframe";
import { GameStoreService } from "@/services/GameStoreService";
import "@/components";
import "@/pages";
import "@/deps/aframe.min.js";
import "@/deps/aframe-extras.min.js";
import "@/deps/mindar-image-aframe.prod.js";
import { IErrorPage } from "@/pages/error-page";
import { IQRButton } from "@/components/buttons/qr-button";
import { getURLParam, getURLParams, assert } from "@/utils";

export class BookGame extends HTMLElement {
  private errorPage: IErrorPage | null = null;
  private loadingPage: ILoadingPage | null = null;
  private qrButton: IQRButton | null = null;
  private pagesRouter: IPagesRouter | null = null;

  constructor() {
    super();
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
    
    header {
      width: 100%;
      position: fixed;
      top: 0;
      right: 0;
      height: var(--offset-top,4rem);
      display: flex;
      align-items: center;
      gap: 1rem;
      cursor: pointer;
    }
    
    .header-left {
      padding-left: 1rem;
    }
    
    .header-right {
      padding-right: 1rem;
    }
    
    .header-dash {
      flex: 1;
      background-color: var(--color-primary);
      height: 0.2rem;
      transform: translateY(.1rem);
      border-radius: 0.05rem;
    }
  `;

  template = /* html */ `
    <a-scene id="scene">
    </a-scene>
    <qr-scanner></qr-scanner>
    
    <header id="main-header">
      <div class="header-left">Kevin Bray</div>
      <div class="header-dash"></div>
      <div class="header-right">Onion Skin and Crocodile Tears</div>
    </header>
    
    <pages-router>
      <error-page></error-page>
      <about-page></about-page>
      <not-found-page></not-found-page>
      <home-page></home-page>
      <tutorial-page></tutorial-page>
      <index-page></index-page>
      <chapters-page></chapters-page>
      <chapter-page></chapter-page>
    </pages-router>
      
    <navigation-bar></navigation-bar>
    <loading-page></loading-page>
    
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

  private async initializeComponents() {
    // Cache component references
    this.errorPage = this.shadowRoot!.querySelector("error-page");
    this.loadingPage = this.shadowRoot!.querySelector("loading-screen");
    this.pagesRouter = this.shadowRoot!.querySelector("pages-router");

    // Add header click handler
    const header = this.shadowRoot!.querySelector("#main-header");
    header?.addEventListener("click", () => {
      const game = GameStoreService.getInstance().getGame();
      if (game) {
        game.router.navigate("/about");
      }
    });

    try {
      // Get the GameStoreService instance
      const gameService = GameStoreService.getInstance();
      const game = gameService.initialize();

      const sceneElement = this.shadowRoot!.querySelector(
        "#scene"
      ) as unknown as Scene;
      await game.scene.attachScene(sceneElement);

      /* @ts-ignore - Expose game for debugging */
      window.BOOKGAME = game;
    } catch (error) {
      this.handleError(error);
    }
  }

  private setupGameState() {
    const game = GameStoreService.getInstance().getGame();
    assert(game, "Game store not initialized");

    const { slug, mode, params } = getURLParams();

    // Handle mode
    if (mode === GameMode.QR) {
      game.qr.startScanning();
    }
    // TODO: Double check Scene visbility game.scene.updateVisibility(mode);
    if (mode === GameMode.VR) {
      game.scene.updateSceneVisibility();
    }

    const chapterId = getURLParam("id");
    if (chapterId) {
      game.chapters.switchChapter(chapterId);
    }

    // Navigate to page
    if (slug) {
      game.router.navigate(slug, params);
    } else {
      game.router.navigate("/chapters");
    }

    game.subscribe(this.handleStateChange.bind(this));
  }

  private handleStateChange(state: {
    currentChapter: ChapterResource | null;
    mode: GameMode;
    currentRoute: Route | null;
  }) {
    // Delegate state changes to components
    this.updateChapterState(state.currentChapter);
    this.updateRouteState(state.currentRoute);
  }

  private updateChapterState(chapter: ChapterResource | null) {
    if (!chapter) return;

    if (this.loadingPage) {
      if (chapter.status === LoadingState.LOADING) {
        this.loadingPage.showLoading(`Loading chapter ${chapter.id}...`);
      } else {
        this.loadingPage.hideLoading();
      }
    }

    if (chapter.error) {
      this.handleError(chapter.error);
    }
  }

  private updateRouteState(route: Route | null) {
    if (this.pagesRouter) {
      this.pagesRouter.updateRoute(route);
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
