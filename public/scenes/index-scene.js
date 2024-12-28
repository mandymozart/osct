export class IndexScene extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.currentState = "idle";

    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
    `;

    this.template = document.createElement("template");
    this.updateTemplate();

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(this.template.content.cloneNode(true));
  }

  connectedCallback() {
    if (document.GlobalTrackingState) {
      document.GlobalTrackingState.onStateChange(
        this.handleStateChange.bind(this)
      );
    }
  }

  disconnectedCallback() {
    if (
      document.GlobalTrackingState &&
      document.GlobalTrackingState.offStateChange
    ) {
      document.GlobalTrackingState.offStateChange(
        this.handleStateChange.bind(this)
      );
    }
  }

  handleStateChange(newState) {
    this.currentState = newState;
    this.updateTemplate(); // Re-render with the updated state
  }

  updateTemplate() {
    this.template.innerHTML = `
      <h2>Index</h2>
      <p>Current State: ${JSON.stringify(this.currentState)}</p>
    `;

    while (this.shadowRoot.firstChild) {
      this.shadowRoot.removeChild(this.shadowRoot.firstChild);
    }
    this.shadowRoot.appendChild(this.template.content.cloneNode(true));
  }
}

customElements.define("index-scene", IndexScene);
