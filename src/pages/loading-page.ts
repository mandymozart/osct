import { GameMode, IGame, LoadingState } from "@/types";
import { IPage, Page } from "./page";
import { GameStoreService } from "@/services/GameStoreService";

export interface ILoadingPage extends IPage {}

/**
 * Loading Page is a simple overlay page that displays
 * loading states to the user.
 *
 * Example usage:
 * // Show loading with auto-hide
 * showLoading('Loading chapter...', 5000);
 *
 * // Show persistent loading
 * showLoading('Please wait...');
 *
 * // Hide manually
 * hideLoading();
 */
class LoadingPage extends Page {
  private message: string = "Loading...";
  protected game: Readonly<IGame>;
  private currentLoadingState: LoadingState;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    // Initialize with current state
    this.currentLoadingState = this.game.state.loading;
    
    // Set initial UI state based on loading state
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

  /**
   * Helper to check if a state is considered "loading"
   */
  private isLoading(state: LoadingState): boolean {
    return state === LoadingState.LOADING || state === LoadingState.INITIAL;
  }

  /**
   * Handle game state changes, only updating UI when loading state changes
   */
  protected handleStateChange(state: { loading: LoadingState }) {
    // Only process if loading state has actually changed
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
                z-index: 1000;
            }
            
            .loading {
                font-size: 1em;
                color: var(--color-primary);
                padding: 4rem;
                text-align: center;
            }

            .loading::after {
                content: '...';
                animation: dots 1.5s steps(4, end) infinite;
            }

            @keyframes dots {
                0%, 20% { content: ''; }
                40% { content: '.'; }
                60% { content: '..'; }
                80%, 100% { content: '...'; }
            }
        `;
  }

   get template(): string {
    return /* html */ `
            <div class="loading">${this.message}</div>
        `;
  }

  private showLoading(msg: string = "Loading"): void {
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
