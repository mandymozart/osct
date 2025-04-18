import { GameMode } from "@/types";
import { PageMinimal } from "./page-minimal";

export class HomePage extends PageMinimal {
  public get styles(): string {
    return /* css */ `
    :host {
      pointer-events: none;
      bottom: 5rem;
      position: fixed;
      width: 100%;
    }
    button {
      pointer-events: all;
    }
    .content {
      display: grid;
      gap:1rem;
      grid-template-columns: repeat(2, 1fr);
      padding: 1rem;
    }
    `;
  }

  public get template(): string {
    return /* html */ `
    <div class="content">
      <button is="text-button" id="tutorial-btn">Tutorial</button>
      <button is="text-button" variant="secondary" id="start-btn">Start</button>
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

    startBtn?.addEventListener("click", this.handleStart);
    tutorialBtn?.addEventListener("click", this.handleTutorial);
  }

  private removeListeners() {
    const startBtn = this.shadowRoot?.querySelector("#start-btn");
    const tutorialBtn = this.shadowRoot?.querySelector("#tutorial-btn");

    startBtn?.removeEventListener("click", this.handleStart);
    tutorialBtn?.removeEventListener("click", this.handleTutorial);
  }

  private handleStart() {
    this.game.router.close();
  }

  private handleTutorial() {
    this.game.router.navigate("/tutorial", { key: "step", value: "0" });
  }
}

customElements.define("home-page", HomePage);
