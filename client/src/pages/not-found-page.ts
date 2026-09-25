import { Page } from "./page";
import { adoptDesignStyles } from "@/styles";

/** Overlay for unknown routes – consultation look (design system, DESIGN.md) */
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
        justify-content: center;
        align-items: center;
        color: var(--color-on-dark);
      }
    `;
  }

  get template(): string {
    return `
      <div class="content design">Page not found</div>
    `;
  }

  constructor() {
    super();
    adoptDesignStyles(this.shadowRoot);
  }
}

customElements.define("not-found-page", NotFoundPage);
