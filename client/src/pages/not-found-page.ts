import { Page } from "./page";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import { t, tHtml } from "@/i18n";

/**
 * Overlay for unknown routes and links whose target doesn't exist (anymore) – consultation look
 * (DESIGN.md). "Go to start" leads to the start page.
 */
export class NotFoundPage extends Page {
  get styles(): string {
    return /* css */ `
      :host {
        top: 0;
        height: 100%;
        border-radius: 0;
        box-shadow: none;
        background: var(--consultation-background);
      }
      .content {
        height: 100%;
        padding: 0 2rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 1.5rem;
        text-align: center;
        color: var(--color-on-dark);
      }
      p { margin: 0; }
    `;
  }

  get template(): string {
    return /* html */ `
      <div class="content design">
        <p>${tHtml("notFound.text")}</p>
        ${goldButton({ label: t("common.goToStart"), attrs: { "data-action": "start" } })}
      </div>
    `;
  }

  constructor() {
    super();
    adoptDesignStyles(this.shadowRoot);
  }

  setupEventListeners(): void {
    this.shadowRoot?.addEventListener("click", this.handleClick);
  }

  cleanupEventListeners(): void {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
  }

  private handleClick = (event: Event) => {
    if ((event.target as HTMLElement).closest("[data-action=start]")) this.game.router.navigate("/");
  };
}

customElements.define("not-found-page", NotFoundPage);
