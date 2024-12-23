import { LitElement, css, html } from 'lit';

export class HomeScene extends LitElement {
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
    <h1>Onion Skin and Crocodile Tears</h1>
    <h2>Kevin Bray</h2>
      <p>Pick a scene / Order the book</p>
    `;
  }
}

customElements.define('home-scene', HomeScene);
