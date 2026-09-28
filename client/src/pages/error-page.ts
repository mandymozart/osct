import { MEDIA_QUERY } from "@/constants";
import { GameStoreService } from "@/services";
import { IGame } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import { Page } from "./page";
import { t } from "i18next";

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
 * Error overlay: shows the store's `currentError` (message, optional code and action button) and hides
 * when it is cleared. "Dismiss" clears the error and returns to the view underneath.
 */
class ErrorPage extends Page implements IErrorPage {
  private message: string = '';
  private errorCode: string = '';
  private actionButton: { text: string; callback: () => void } | null = null;
  protected game: Readonly<IGame>;
  private currentError: any = null;

  constructor() {
    super();
    adoptDesignStyles(this.shadowRoot);
    this.game = GameStoreService.getInstance();
  }

  connectedCallback() {
    super.connectedCallback();
    this.game.subscribe(this.handleStateChange.bind(this));
  }

  disconnectedCallback() {
    this.game.unsubscribe(this.handleStateChange.bind(this));
    super.disconnectedCallback();
  }

  protected handleStateChange(state: any): void {
    if (state.currentError !== undefined &&
      JSON.stringify(state.currentError) !== JSON.stringify(this.currentError)) {

      this.currentError = state.currentError;

      if (state.currentError === null) {
        this.active = false;
      } else {
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
              background: var(--consultation-background);
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
          
          :host { flex-direction: column; }
          .message {
              max-width: 20rem;
              padding: 2rem;
              color: var(--color-on-dark);
              text-align: center;
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
      <div class="message design">${this.message}</div>
      <div class="actions">
          ${goldButton({ label: t("common:dismiss"), attrs: { id: "dismiss-error" } })}
          ${this.actionButton
    ? goldButton({ label: this.actionButton.text, primary: true, attrs: { id: "action-button" } })
    : ''}
      </div>
      `;
  }

  /** Shows an error; called on store changes or directly */
  public showError(msg: string, options: ErrorOptions = {}): void {
    console.log(`[ErrorPage] Showing error: ${msg}`, options);
    this.message = msg;
    this.errorCode = options.code || '';
    this.actionButton = options.action || null;

    if (this.actionButton) {
      console.log('[ErrorPage] Action button will be shown:', this.actionButton.text);
    } else {
      console.log('[ErrorPage] No action button to show');
    }

    this.render();
    this.active = true;
    this.game.finishLoading();

    // Deferred until the rendered buttons exist
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
    this.game.router.dismissError();
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
