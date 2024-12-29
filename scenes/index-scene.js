import trackingTargets from "../targets/testingTargets.js";

const gameStore = document.gameStore;

export class IndexScene extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.trackedTargets = [];
    this.handleStateChange = this.handleStateChange.bind(this);
  }
  connectedCallback() {
    this.render();
    gameStore.subscribe(this.handleStateChange);
    this.trackedTargets = gameStore.getTargets();
    this.updateView();
  }
  disconnectedCallback() {
    // Unsubscribe from TrackingStore updates
    gameStore.subscribe(this.handleStateChange);
  }
  handleStateChange(newState) {
    this.trackedTargets = newState.trackedTargets;
    this.updateView();
  }
  updateView() {
    const targetList = this.trackedTargets
      .filter((id) => trackingTargets[id].mode === "index")
      .map(
        (id) => /* html */ `<li>
            <div>
            ${trackingTargets[id].book} &mdash; ${trackingTargets[id].description}
            </div>
            <div>
              <img src="/images/images-${trackingTargets[id].jpg}.jpg" alt="Image of ${trackingTargets[id].description}" />
            </div>
          </li>`
      )
      .join("");

    this.shadowRoot.querySelector("#targets-list").innerHTML =
      targetList || "<p>No targets in view</p>";
  }
  render() {
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
          background: white;
          position: fixed;
          bottom: 0;
          transform: translateY(calc(100vh - 6rem));
          border-top-left-radius: 2rem;
          border-top-right-radius: 2rem;
          transition: transform 0.3s;
          height: calc(100vh - 6rem);
          width: 100vw;
          pointer-events: all;
        }
        :host(.active) {
          transform: translateY(0);
        }
        .content {
          padding: 0 2rem;
          overflow-y: auto;
          height: calc(100vh - 8rem);
          margin-top: 2rem;
        } 
        .close-button {
          position: absolute;
          top: 2rem;
          right: 2rem;
          background-color: var(--color-primary);
          color: white;
          border: none;
          border-radius: 50%;
          width: 2rem;
          height: 2rem;
          font-size: 1.5rem;
          cursor: pointer;
        }
        .close-button:hover {
          border-color: var(--color-secondary);
          background-color: var(--color-background);
          color: var(--color-secondary);
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
      </style>

      <div class="content">
        <h2>Index</h2>
        <ul id="targets-list">
          <p>No targets in view</p>
        </ul>
      </div>
      <button class="close-button">×</button>
    `;

    // Close
    this.shadowRoot
      .querySelector(".close-button")
      .addEventListener("click", () => {
        gameStore.setScene(null);
      });
  }
}

customElements.define("index-scene", IndexScene);
