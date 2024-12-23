import { LitElement, css, html } from 'lit';

export class IndexScene extends LitElement {
  constructor() {
    super();
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
      <p>Information about references.</p>
    `;
  }
}

customElements.define('index-scene', IndexScene);
