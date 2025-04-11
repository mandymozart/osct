import { ILoadingPage } from "./pages/loading-page";
import { GameStoreService } from "@/services/GameStoreService";
import "@/components";
import "@/pages";
import { IErrorPage } from "@/pages/error-page";
import {
  IGame,
  IPagesRouter,
  ChapterResource,
  LoadingState,
  PageRoute,
} from "@/types/";
import { waitForDOMReady } from "./utils/dom";
console.log(import.meta.env)
export class BookGame extends HTMLElement {
  private game: Readonly<IGame>;
  private errorPage: IErrorPage | null = null;
  private loadingPage: ILoadingPage | null = null;
  private pagesRouter: IPagesRouter | null = null;

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
    <loading-page active></loading-page>

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
    // Cache component references
    this.errorPage = this.shadowRoot!.querySelector("error-page");
    this.loadingPage = this.shadowRoot!.querySelector("loading-screen");
    this.pagesRouter = this.shadowRoot!.querySelector("pages-router");
    this.loadingPage?.showLoading();
  }

  private async setupGameState() {
    try {
      await waitForDOMReady();
      await this.game.scene.attachScene("#scene");
      window.BOOKGAME = this.game;
      console.log(
        `[BookGame] Initialized version ${this.game.version.version} / ${this.game.version.timestamp}) ID: ${this.game.state.id}`
      );
    } catch (error) {
      this.handleError(error);
    }

    this.game.subscribe(this.handleStateChange.bind(this));
  }

  private handleStateChange(state: {
    currentChapter: ChapterResource | null;
    currentRoute: PageRoute | null;
  }) {
    this.updateChapterState(state.currentChapter);
    this.updateRouteState(state.currentRoute);
  }

  // TODO: Refactor so loading is handled by the loading page
  // as a consequence of the game state.
  // The chapter tree be granular enough to handle loading specifically
  // for each chapter's assets.
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

  private updateRouteState(route: PageRoute | null) {
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
