import { Page } from "./page";
import { assert } from "@/utils";

export class HomePage extends Page {
  protected get styles(): string {
    return /* css */ `
      .content {
          padding: 0 2rem;
          overflow-y: auto;
          height: calc(100vh - 12rem);
        } 
        #tutorial-btn {
          position: absolute;
          bottom: 0;
          left: 2rem;
          right: 2rem;
        }
        h2 {
          font-size: 1.5rem;
          line-height: 4rem;
          font-weight: 400;
          margin-bottom: 4rem;
          color: var(--primary-500);
        }
        p {
          font-size: 1.5rem;
        }
    `;
  }

  protected get template(): string {
    return /* html */ `
      <div class="content">
        <h2>Welcome to OSCT</h2>
        <p>This is it. Are you ready?</p>
        <button is="text-button" variant="secondary" id="start-btn">Start</button><br />
        <button is="text-button" id="tutorial-btn">How does it work?</button>
        <close-button></close-button>
      </div>
    `;
  }

  constructor() {
    super();
    this.handleStart = this.handleStart.bind(this);
    this.handleTutorial = this.handleTutorial.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.setupListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeListeners();
  }

  private setupListeners() {
    const startBtn = this.shadowRoot?.querySelector("#start-btn");
    const tutorialBtn = this.shadowRoot?.querySelector("#tutorial-btn");
    const closeButton = this.shadowRoot?.querySelector("close-button");

    startBtn?.addEventListener("click", this.handleStart);
    tutorialBtn?.addEventListener("click", this.handleTutorial);
    closeButton?.addEventListener("close", this.handleStart);
  }

  private removeListeners() {
    const startBtn = this.shadowRoot?.querySelector("#start-btn");
    const tutorialBtn = this.shadowRoot?.querySelector("#tutorial-btn");
    const closeButton = this.shadowRoot?.querySelector("close-button");

    startBtn?.removeEventListener("click", this.handleStart);
    tutorialBtn?.removeEventListener("click", this.handleTutorial);
    closeButton?.removeEventListener("close", this.handleStart);
  }

  private handleStart() {
    assert(this.game, "Game store not initialized");
    this.game.router.close();
  }

  private handleTutorial() {
    assert(this.game, "Game store not initialized");
    this.game.router.navigate("/tutorial", { key: "step", value: "0" });
  }
}

customElements.define("home-page", HomePage);
