import { scenes } from "./scenes/index.js";

class UserInterface extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.active = false;
  }

  changeScene(scene) {
    this.dispatchEvent(
      new CustomEvent("change-scene", {
        detail: { scene },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          text-align: center;
          z-index: 100;
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
      </style>

      <div>
        <a href="https://buildingfictions.com" target="_blank">
          <img src="/assets/bf.svg" class="logo" alt="buildingfictions logo" />
        </a>
      </div>
      <div class="card">
        <button id="home-button">Home</button>
        <button id="ar-button">AR</button>
        <button id="index-button">Index</button>
      </div>
    `;

    this.shadowRoot
      .querySelector("#home-button")
      .addEventListener("click", () => this.changeScene(scenes.HOME));
    this.shadowRoot
      .querySelector("#ar-button")
      .addEventListener("click", () => this.changeScene(scenes.BOOK));
    this.shadowRoot
      .querySelector("#index-button")
      .addEventListener("click", () => this.changeScene(scenes.INDEX));
  }

  connectedCallback() {
    this.render();
  }
}

window.customElements.define("user-interface", UserInterface);
