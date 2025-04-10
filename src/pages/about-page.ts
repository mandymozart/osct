import { Page } from "./page";
import "../components/common/close-button"; // Import close button component

export class AboutPage extends Page {

  constructor() {
    super();
  }
  
  protected get styles(): string {
    return /* css */ `
      .content {
          padding: 0 2rem;
          overflow-y: auto;
          height: calc(100vh - var(--offset-top)-2rem);
        } 
        .logo {
          height: 6em;
        }
        .page-title {
            font-size: 1.5rem;
            font-weight: 400;
            margin-bottom: 1rem;
            line-height: 6rem;
            color: var(--primary-500);
          }
          h2 {
            font-size: 1.5rem;
            font-weight: 400;
            margin-bottom: 1rem;
          }
    `;
  }

  protected get template(): string {
    return `
      <div class="content">
        <div class="page-title">About</div>
        <h2>Kevin Bray &mdash; Onion Skin and Crocodile Tears</h1>
        <p>&copy; 2025</p>
        <p>Published by buildingfictions</p>
        <div>
          <a href="https://buildingfictions.com" target="_blank">
            <img src="/assets/bf.svg" class="logo" alt="buildingfictions logo" />
          </a>
        </div>
        <p>App by Tilman Porschuetz</p>
        <p>Requires a WebXR compatible browser and a copy of the book.</p>
      </div>
      <close-button></close-button>
    `;
  }

  setupEventListeners() {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    if (closeButton) {
      closeButton.addEventListener("close", () => {
        if (this.game) {
          this.game.router.close();
        }
      });
    }
  }
}

customElements.define("about-page", AboutPage);
