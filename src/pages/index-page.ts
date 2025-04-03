import { Page } from "./page";
import { GameMode, Target } from "../store/types";
import { assert } from "../utils/assert";

export class IndexPage extends Page {
  private trackedTargets: Target[] = [];

  protected get styles(): string {
    return /* css */ `
      .content {
        padding: 0 2rem;
        overflow-y: auto;
        height: calc(100vh - 8rem);
        margin-top: 2rem;
      }
      h2 {
        margin: 0 0 1rem 0;
      }
      ul {
        list-style-type: none;
        padding: 0;
      }
      li {
        margin: 0;
        padding: 1rem 0;
        border-bottom: 1px solid var(--color-primary);
        display: flex;  
        justify-content: space-between;
      }
      li img {
        width: calc(50vw - 2rem);
        display: block;
      }
      li:last-child {
        border: none;
      }
    `;
  }

  protected get template(): string {
    return /* html */ `
      <div class="content">
        <h2>Index</h2>
        <ul id="targets-list">
          <p>No targets in view</p>
        </ul>
      </div>
    `;
  }

  constructor() {
    super();
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    assert(this.game, 'Game store not initialized');
    
    this.game.subscribe(this.handleStateChange);
    this.trackedTargets = this.game.getTrackedTargetObjects();
    this.updateView();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange);
  }

  private handleStateChange(state: { mode: GameMode, trackedTargets: number[] }) {
    assert(this.game, 'Game store not initialized');
    
    // Get full target objects instead of just indices
    this.trackedTargets = this.game.getTrackedTargetObjects();
    this.updateView();
  }

  private updateView() {
    assert(this.shadowRoot, 'Shadow root not initialized');
    
    const targetList = this.trackedTargets
      .filter((target) => target.mode === "index")
      .map(
        (target) => /* html */ `<li>
            <div>
              ${target.book} &mdash; ${target.description}
            </div>
            <div>
              <img src="/images/images-${target.image}.jpg" alt="Image of ${target.description}" />
            </div>
          </li>`
      )
      .join("");

    const targetsList = this.shadowRoot.querySelector("#targets-list");
    assert(targetsList, 'Targets list element not found');
    
    targetsList.innerHTML = targetList || "<p>No targets in view</p>";
  }
}

customElements.define("index-page", IndexPage);
