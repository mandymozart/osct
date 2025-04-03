import { Page } from "./page";

export class NotFoundPage extends Page {
  protected get styles(): string {
    return /* css */ `
      .content {
          padding: 0 2rem;
          overflow-y: auto;
          margin-top: 2rem;
          display: flex;
          justify-content: center;
          align-items: stretch;
        } 
    `;
  }

  protected get template(): string {
    return `
      <div class="content">
      🙅🏾 Page not found
      </div>
    `;
  }

  constructor() {
    super();
  }
}

customElements.define("not-found-page", NotFoundPage);
