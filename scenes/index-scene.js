export class IndexScene extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.currentState = "idle";

    this.template = document.createElement("template");
    this.updateTemplate();

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
    this.updateTemplate();
  }

  updateTemplate() {
    this.template.innerHTML = /*html*/ `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
      </style>
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
