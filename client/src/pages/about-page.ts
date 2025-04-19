import { Page } from "./page";
import "../components/common/close-button"; // Import close button component
import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types";

export class AboutPage extends Page {
  protected game: Readonly<IGame>;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.setupEventListeners();
  }
  
  get styles(): string {
    return /* css */ `
      .content {
          padding: 0 1rem;
          overflow-y: auto;
          height: calc(100vh - var(--offset-top)-2rem);
          pointer-events: auto;
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

  get template(): string {
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
        <div class="buttons">
          <button is="text-button" id="tutorial-btn">Tutorial</button>
        </div>
        <p>Requires a WebXR compatible browser and a copy of the book.</p>
        <p>Android: Chrome</p>
        <p>Desktop: Chrome, Firefox, Safari</p>
        <p>iOS: Safari, Chrome</p>
        <close-button></close-button>
      </div>
    `;
  }

  setupEventListeners() {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    closeButton?.addEventListener("close", this.handleClose.bind(this));
    
    const tutorialButton = this.shadowRoot?.querySelector("#tutorial-btn");
    tutorialButton?.addEventListener("click", this.handleTutorial.bind(this));
  }
  
  cleanupEventListeners() {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    closeButton?.removeEventListener("close", this.handleClose.bind(this));
    
    const tutorialButton = this.shadowRoot?.querySelector("#tutorial-btn");
    tutorialButton?.removeEventListener("click", this.handleTutorial.bind(this));
  }
  
  private handleClose() {
    this.game.router.close();
  }
  
  private handleTutorial() {
    this.game.router.navigate("/tutorial");
  }

  disconnectedCallback() {
    this.cleanupEventListeners();
  }
}

customElements.define("about-page", AboutPage);
