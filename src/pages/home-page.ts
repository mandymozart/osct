import { Page } from "./page";
import "./../components/text-button";
import { assert} from "./../utils/assert";

export class HomePage extends Page {
  protected get styles(): string {
    return /* css */ `
      .content {
          padding: 0 2rem;
          overflow-y: auto;
          height: calc(100vh - 8rem);
          margin-top: 2rem;
        } 
        #tutorial-btn {
          position: absolute;
          bottom: 2rem;
          left: 2rem;
          right: 2rem;
        }
    `;
  }

  protected get template(): string {
    return /* html */`
      <div class="content">
        <h2>Welcome to OSCT</h2>

        <button is="text-button" variant="secondary" id="start-btn">Start</button><br />
        <button is="text-button" id="tutorial-btn">How does it work?</button>
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
    const startBtn = this.shadowRoot?.querySelector('#start-btn');
    const tutorialBtn = this.shadowRoot?.querySelector('#tutorial-btn');

    startBtn?.addEventListener('click', this.handleStart);
    tutorialBtn?.addEventListener('click', this.handleTutorial);
  }

  private removeListeners() {
    const startBtn = this.shadowRoot?.querySelector('#start-btn');
    const tutorialBtn = this.shadowRoot?.querySelector('#tutorial-btn');

    startBtn?.removeEventListener('click', this.handleStart);
    tutorialBtn?.removeEventListener('click', this.handleTutorial);
  }

  private handleStart() {
    assert(this.game, 'Game store not initialized');
    this.game.closePage();
  }

  private handleTutorial() {
    assert(this.game, 'Game store not initialized');
    this.game.navigate('/tutorial');
  }
}

customElements.define("home-page", HomePage);
