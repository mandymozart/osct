import { Page } from "./page";
import { ErrorCode, IGame } from "@/types";
import { GameStoreService } from "@/services/GameStoreService";
import { MEDIA_QUERY } from "@/constants";

export interface IErrorPage extends HTMLElement {
  showError(msg: string, options?: ErrorOptions): void;
}

export interface ErrorOptions {
  action?: {
    text: string;
    callback: () => void;
  };
  code?: string;
}

/**
 * Error page displays errors to the user with optional action buttons.
 * It automatically subscribes to the game state to display any errors
 * that are set in the currentError property.
 */
class ErrorPage extends Page implements IErrorPage {
  private message: string = '';
  private errorCode: string = '';
  private actionButton: { text: string; callback: () => void } | null = null;
  protected game: Readonly<IGame>;
  private currentError: any = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
  }

  connectedCallback() {
    super.connectedCallback();
    // Subscribe to game state changes
    this.game.subscribe(this.handleStateChange.bind(this));
  }

  disconnectedCallback() {
    // Clean up subscriptions
    this.game.unsubscribe(this.handleStateChange.bind(this));
    super.disconnectedCallback();
  }

  /**
   * Handle game state changes
   */
  protected handleStateChange(state: any): void {
    // Only process if currentError state has actually changed
    if (state.currentError !== undefined &&
      JSON.stringify(state.currentError) !== JSON.stringify(this.currentError)) {

      // Update our stored reference
      this.currentError = state.currentError;

      if (state.currentError === null) {
        // Hide the error page if currentError is null
        this.active = false;
      } else {
        // Display the error using data from state
        const error = state.currentError;
        this.showError(error.msg, {
          code: error.code,
          action: error.action
        });
      }
    }
  }

   get styles(): string {
    return /* css */ `
          :host {
              opacity: 0;
              visibility: hidden;
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              height: 100%;
              display: flex !important;
              border-radius: 0;
              background-color: var(--primary-800);
              z-index: 1000;

              justify-content: center;
              align-items: center;
              pointer-events: none;
          }
          
          :host([active="true"]) {
              opacity: 1;
              visibility: visible;
              pointer-events: auto;
          }
          
          .message {
              font-size: 1.5rem;
              padding: 2rem;
              color: var(--color-background);
              text-align: center;
              margin-bottom: 1rem;
          }
                  
          .actions {
              display: flex;
              padding: 2rem;
              gap:1rem;
          }
          @media ${MEDIA_QUERY.TABLET} {
            .actions {
                flex-direction: column-reverse;
            }
          }
          
      `;
  }

   get template(): string {
    return /* html */ `
      <div class="message">${this.message}</div>
      <div class="actions">
          <button is="text-button" variant="${this.actionButton ? 'primary' : 'secondary'}" inverted id="dismiss-error">Dismiss</button>
          ${this.actionButton
    ? `<button is="text-button" variant="secondary" inverted id="action-button">${this.actionButton.text}</button>`
    : ''}
      </div>
      `;
  }

  /**
   * Show an error message with optional code and action button
   * This can be called directly or triggered by state changes
   */
  public showError(msg: string, options: ErrorOptions = {}): void {
    console.log(`[ErrorPage] Showing error: ${msg}`, options);
    this.message = msg;
    this.errorCode = options.code || '';
    this.actionButton = options.action || null;

    // Log if we have an action button
    if (this.actionButton) {
      console.log('[ErrorPage] Action button will be shown:', this.actionButton.text);
    } else {
      console.log('[ErrorPage] No action button to show');
    }

    this.render();
    this.active = true; // Use the setter from Page class

    // Add event listeners to buttons
    setTimeout(() => {
      const dismissButton = this.shadowRoot?.querySelector('#dismiss-error');
      const actionButton = this.shadowRoot?.querySelector('#action-button');

      if (dismissButton) {
        dismissButton.addEventListener('click', this.handleDismiss.bind(this));
      }

      if (actionButton && this.actionButton) {
        console.log('[ErrorPage] Adding action button click listener');
        actionButton.addEventListener('click', this.handleAction.bind(this));
      }
    }, 0);
  }

  private handleDismiss(): void {
    // Close the error and clear it from state
    this.game.router.close();
  }

  private handleAction(): void {
    console.log('[ErrorPage] Action button clicked');
    if (this.actionButton && this.actionButton.callback) {
      console.log('[ErrorPage] Executing callback');
      this.actionButton.callback();
    } else {
      console.warn('[ErrorPage] No callback defined for action button');
    }
  }
}

customElements.define("error-page", ErrorPage);
