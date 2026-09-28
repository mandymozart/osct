import { GameMode, IGame, LoadingState } from "@/types";
import { Page } from "./page";
import { GameStoreService } from "@/services";
import { adoptDesignStyles } from "@/styles";
import { t } from "i18next";
import { escapeHtml } from "@/utils";

/**
 * Loading overlay outside the pages router: shown while the store's loading state is active, with a gold
 * loader on the consultation-mode darkness. Re-renders only when the loading state actually changes.
 */
class LoadingPage extends Page {
  private message: string = t("common:loading");
  protected game: Readonly<IGame>;
  private currentLoadingState: LoadingState;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    adoptDesignStyles(this.shadowRoot);
    this.currentLoadingState = this.game.state.loading;
    
    if (this.isLoading(this.currentLoadingState)) {
      this.showLoading();
    } else {
      this.hideLoading();
    }
    
    this.setupListeners();
  }

   setupListeners(): void {
    this.game.subscribe(this.handleStateChange.bind(this));
  }

  private isLoading(state: LoadingState): boolean {
    return state === LoadingState.LOADING || state === LoadingState.INITIAL;
  }

  protected handleStateChange(state: { loading: LoadingState }) {
    if (state.loading !== this.currentLoadingState) {
      this.currentLoadingState = state.loading;
      
      if (this.isLoading(state.loading)) {
        this.showLoading();
      } else {
        this.hideLoading();
      }
    }
  }

  get styles(): string {
    return /* css */ `
      :host {
        top: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        border-radius: 0;
        box-shadow: none;
        background: var(--loading-background);
        z-index: 1000;
      }
    `;
  }

  get template(): string {
    return /* html */ `
      <div class="gold-spinner" role="status"></div>
      <span class="visually-hidden">${escapeHtml(this.message)}</span>
    `;
  }

  private showLoading(msg: string = t("common:loading")): void {
    this.message = msg;
    this.active = true;
    this.render();
  }

  private hideLoading(): void {
    this.active = false;
    this.render();
  }
}

customElements.define("loading-page", LoadingPage);
