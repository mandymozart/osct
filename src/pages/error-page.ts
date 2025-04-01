import { Page } from "./page";

export interface ErrorPageInterface extends HTMLElement {
    showError(msg: string, duration?: number): void;
}

/**
 * Error page is a simple overlay page that can be used to display
 * error messages to the user.
 * 
 * Show error with auto-hide after 5 seconds
 * showError({ code: 'ERROR', msg: 'Something went wrong' });
 * 
 * // Show persistent error
 * showError({ code: 'FATAL', msg: 'Fatal error occurred' }, 0);
 */
class ErrorPage extends Page {
  private message: string = '';

  protected get styles(): string {
      return /* css */ `
          .message {
              font-size: 1em;
              color: var(--color-primary);
              padding: 4rem;
              text-align: center;
          }
      `;
  }

  protected get template(): string {
      return /* html */ `
          <div class="message">${this.message}</div>
      `;
  }

  public showError(msg: string, duration: number = 5000): void {
      this.message = msg;
      this.render();
      this.active = true;

      if (duration > 0) {
          setTimeout(() => {
              this.active = false;
          }, duration);
      }
  }
}

customElements.define("error-screen", ErrorPage);
