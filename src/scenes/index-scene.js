import { LitElement, css, html } from "lit";

export class IndexScene extends LitElement {
  static properties = {
    currentState: { type: String }, // Reactive property to store the state
  };

  constructor() {
    super();
    this.currentState = "idle"; // Default state
  }

  connectedCallback() {
    super.connectedCallback();
    // Subscribe to GlobalTrackingState
    document.GlobalTrackingState.onStateChange(
      this.handleStateChange.bind(this)
    );
  }

  handleStateChange(newState) {
    this.currentState = newState; // Update Lit's reactive property
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `;

  render() {
    return html`
      <h2>Index</h2>
      <p>Current State: ${JSON.stringify(this.currentState)}</p>
    `;
  }
}

customElements.define("index-scene", IndexScene);
