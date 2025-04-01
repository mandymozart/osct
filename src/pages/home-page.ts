import { Page } from "./page";

export class HomePage extends Page {
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
      <h2>Welcome to OSCT</h2>

      <button>Start</button><br />
      <button>How does it work?</button>
      </div>
    `;
  }

  constructor() {
    super();
  }
}

customElements.define("home-page", HomePage);
