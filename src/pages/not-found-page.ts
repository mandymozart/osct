import { Page } from "./page";

export class NotFoundPage extends Page {
  protected get styles(): string {
    return /* css */ `
      .content {
          padding: 0 2rem;
          overflow-y: auto;
          height: calc(100vh - 8rem);
          margin-top: 2rem;
        } 
    `;
  }

  protected get template(): string {
    return `
      <div class="content">
      Page not found
      </div>
    `;
  }

  constructor() {
    super();
  }
}

customElements.define("not-found-page", NotFoundPage);
