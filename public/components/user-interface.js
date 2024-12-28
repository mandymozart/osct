import { LitElement, css, html } from 'lit';
import { scenes } from '../scenes';
import bfLogo from './../assets/bf.svg';

/**
 * The user interface
 **/
export class UserInterface extends LitElement {
  static get properties() {
    return {
      active: { type: Boolean },
    }
  }

  constructor() {
    super()
    this.active = false;
  }

  changeScene(scene) {
    this.dispatchEvent(new CustomEvent('change-scene', { detail: { scene }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div>
        <a href="https://buildingfictions.com" target="_blank">
          <img src=${bfLogo} class="logo" alt="buildingfictions logo" />
        </a>
      </div>
      <div class="card">
      <button @click=${() => this.changeScene(scenes.HOME)}>Home</button>
        <button @click=${() => this.changeScene(scenes.BOOK)}>AR</button>
        <button @click=${() => this.changeScene(scenes.INDEX)}>Index</button>
      </div>
    `
  }

  static get styles() {
    return css`
      :host {
        max-width: 1280px;
        margin: 0 auto;
        padding: 2rem;
        text-align: center;
      }

      .logo {
        height: 6em;
        padding: 1.5em;
        will-change: filter;
        transition: filter 300ms;
      }
      .logo:hover {
        filter: drop-shadow(0 0 2em #646cffaa);
      }
      .logo.lit:hover {
        filter: drop-shadow(0 0 2em #325cffaa);
      }

      .card {
        padding: 2em;
      }

      a {
        font-weight: 500;
        color: #646cff;
        text-decoration: inherit;
      }
      a:hover {
        color: #535bf2;
      }

      ::slotted(h1) {
        font-size: 3.2em;
        line-height: 1.1;
      }

      button {
        border-radius: 8px;
        border: 1px solid transparent;
        padding: 0.6em 1.2em;
        font-size: 1em;
        font-weight: 500;
        font-family: inherit;
        background-color: #1a1a1a;
        cursor: pointer;
        transition: border-color 0.25s;
      }
      button:hover {
        border-color: #646cff;
      }
      button:focus,
      button:focus-visible {
        outline: 4px auto -webkit-focus-ring-color;
      }

      @media (prefers-color-scheme: light) {
        a:hover {
          color: #747bff;
        }
        button {
          background-color: #f9f9f9;
        }
      }
    `
  }
}

window.customElements.define('user-interface', UserInterface)