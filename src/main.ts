import { createGameStore } from "./store";
import { Chapter, ErrorInfo, GameConfiguration, GameMode, Route } from '../store/types';
import config from './game.config.json';
import { router } from "./router";
import { LoadingPageInterface } from "./pages/loading-page";

export class AppShell extends HTMLElement {
    private game = createGameStore();
    private errorPage: HTMLElement | null = null;
    private loadingUI: HTMLElement | null = null;
    private qrToggle: HTMLElement | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.initializeComponents();
        this.setupGameState();
    }

    private render() {
        this.shadowRoot!.innerHTML = /* html */`
            <style>
                :host {
                    display: block;
                    width: 100vw;
                    height: 100vh;
                }
            </style>
            <a-scene id="scene">
                <slot name="scene-content"></slot>
            </a-scene>

        `;
    }

    private async initializeComponents() {
        // Cache component references
        this.errorPage = this.shadowRoot!.querySelector('error-page');
        this.loadingUI = this.shadowRoot!.querySelector('loading-ui');
        this.qrToggle = this.shadowRoot!.querySelector('qr-toggle');

        try {
            // Initialize game
            const configWithRouter = { ...config, router } as GameConfiguration;
            this.game.initialize(configWithRouter);
            await this.game.attachScene(this.shadowRoot!.querySelector('#scene')!);

            /* @ts-ignore - Expose game for debugging */
            window.game = this.game;
        } catch (error) {
            this.handleError(error);
        }
    }

    private setupGameState() {
        this.game.subscribe(this.handleStateChange.bind(this));
    }

    private handleStateChange(state: { 
        currentChapter: Chapter | null,
        mode: GameMode,
        currentRoute: Route | null 
    }) {
        // Delegate state changes to components
        this.updateChapterState(state.currentChapter);
        this.updateModeState(state.mode);
        this.updateRouteState(state.currentRoute);
    }

    private updateChapterState(chapter: Chapter | null) {
      if (!chapter) return;
  
      const loadingUI = this.loadingUI as LoadingPageInterface;
      if (loadingUI) {
          if (chapter.isLoading) {
              loadingUI.showLoading(`Loading chapter ${chapter.id}...`);
          } else {
              loadingUI.hideLoading();
          }
      }
  
      if (chapter.error) {
          this.handleError(chapter.error);
      }
  }

    private updateModeState(mode: GameMode) {
        if (this.qrToggle) {
            const modeEvent = new CustomEvent('mode-change', { 
                detail: { mode } 
            });
            this.qrToggle.dispatchEvent(modeEvent);
        }
    }

    private updateRouteState(route: Route | null) {
        if (!route) return;
        // Handle route changes if needed
    }

    private handleError(error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        if (this.errorPage) {
            const errorEvent = new CustomEvent('show-error', { 
                detail: { message } 
            });
            this.errorPage.dispatchEvent(errorEvent);
        }
    }
}

customElements.define('app-shell', AppShell);