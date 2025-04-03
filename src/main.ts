import config from "./game.config.json";
import { LoadingPageInterface } from "./pages/loading-page";
import { router } from "./router";
import {
  Chapter,
  GameConfiguration,
  GameMode,
  Pages,
  Route,
} from "./store/types";
import { Scene } from "aframe";
import { GameStoreService } from "./services/GameStoreService";
import "./components/qr-scanner";
import "./components/qr-button";
import "./components/index-button";
import "./components/scene-button";
import "./components/text-button";
import "./pages";
import "./components/pages-router";
import "./deps/aframe.min.js";
import "./deps/aframe-extras.min.js";
import "./deps/mindar-image-aframe.prod.js";
import { PagesRouterInterface } from "./components/pages-router";
import { ErrorPageInterface } from "./pages/error-page";
import { QRButtonInterface } from "./components/qr-button";
import { getURLParam, getURLParams } from "./utils/url-params";

export class BookGame extends HTMLElement {
  private errorPage: ErrorPageInterface | null = null;
  private loadingPage: LoadingPageInterface | null = null;
  private qrButton: QRButtonInterface | null = null;
  private pagesRouter: PagesRouterInterface | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    console.log("Game Book connectedCallback called");
    this.render();
    this.initializeComponents();
    this.setupGameState();
  }

  private render() {
    this.shadowRoot!.innerHTML = /* html */ `
      <style>
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
      </style>
      <!-- A-Frame Scene -->
      <a-scene id="scene">
      </a-scene>
      <header id="main-header">
        <div class="header-left">Kevin Bray</div>
        <div class="header-dash"></div>
        <div class="header-right">Onion Skin and Crocodile Tears</div>
      </header>
      <qr-scanner></qr-scanner>
  
      <loading-page></loading-page>
      <div class="interface">
        <qr-button></qr-button>
      </div>
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
    `;
  }

  private async initializeComponents() {
    // Cache component references
    this.errorPage = this.shadowRoot!.querySelector("error-page");
    this.loadingPage = this.shadowRoot!.querySelector("loading-screen");
    this.qrButton = this.shadowRoot!.querySelector("qr-button");
    this.pagesRouter = this.shadowRoot!.querySelector("pages-router");

    // Add header click handler
    const header = this.shadowRoot!.querySelector('#main-header');
    header?.addEventListener('click', () => {
      const game = GameStoreService.getInstance().getGameStore();
      if (game) {
        game.navigate('/about');
      }
    });

    try {
      // Get the GameStoreService instance
      const gameService = GameStoreService.getInstance();

      // Initialize game with configuration
      const configWithRouter = { ...config, router } as GameConfiguration;
      const game = gameService.initialize(configWithRouter);

      const sceneElement = this.shadowRoot!.querySelector(
        "#scene"
      ) as unknown as Scene;
      await game.attachScene(sceneElement);

      /* @ts-ignore - Expose game for debugging */
      window.BOOKGAME = game;
    } catch (error) {
      this.handleError(error);
    }
  }

  private setupGameState() {
    const game = GameStoreService.getInstance().getGameStore();
    if (!game) {
      console.error("Game store not initialized");
      return;
    }

    const { page, slug, mode, params } = getURLParams();

    // Handle mode
    if (mode === GameMode.QR) {
      game.startQRScanning();
    }

    const chapterId = getURLParam('id');
    if (chapterId) {
      game.switchChapter(chapterId);
    }

    // Navigate to page
    if (slug) {
      game.navigate(slug, params);
    } else {
      game.navigate("/");
    }

    game.subscribe(this.handleStateChange.bind(this));
  }

  private handleStateChange(state: {
    currentChapter: Chapter | null;
    mode: GameMode;
    currentRoute: Route | null;
  }) {
    // Delegate state changes to components
    this.updateChapterState(state.currentChapter);
    this.updateModeState(state.mode);
    this.updateRouteState(state.currentRoute);
  }

  private updateChapterState(chapter: Chapter | null) {
    if (!chapter) return;

    if (this.loadingPage) {
      if (chapter.isLoading) {
        this.loadingPage.showLoading(`Loading chapter ${chapter.id}...`);
      } else {
        this.loadingPage.hideLoading();
      }
    }

    if (chapter.error) {
      this.handleError(chapter.error);
    }
  }

  private updateModeState(mode: GameMode) {
    if (this.qrButton) {
      const modeEvent = new CustomEvent("mode-change", {
        detail: { mode },
      });
      this.qrButton.dispatchEvent(modeEvent);
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
