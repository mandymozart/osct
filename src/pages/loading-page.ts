import { IPage, Page } from "./page";

export interface ILoadingPage extends IPage {
  showLoading(msg?: string, duration?: number): void;
  hideLoading(): void;
}

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

  /**
   * Handle attribute changes
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;

    if (name === "active") {
      this.active = newValue === "true";
    }
  }

  protected get styles(): string {
    return /* css */ `
            :host {
                top: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100%;
                border-radius: 0;
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

  protected get template(): string {
    return /* html */ `
            <div class="loading">${this.message}</div>
        `;
  }

  public showLoading(msg: string = "Loading...", duration: number = 0): void {
    this.message = msg;
    this.render();
    this.active = true;

    if (duration > 0) {
      setTimeout(() => {
        this.hideLoading();
      }, duration);
    }
  }

  public hideLoading(): void {
    this.active = false;
  }
}

customElements.define("loading-page", LoadingPage);
