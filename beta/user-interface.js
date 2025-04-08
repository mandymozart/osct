import { scenes } from "./scenes/index.js";
import { gameStore } from "./stores/GameStore.js";
import "./components/scene-button.js";
import "./components/index-button.js";

class UserInterface extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.activeScene = null;
  }

  connectedCallback() {
    gameStore.subscribe(this.handleSceneChange.bind(this));
    console.log("UserInterface connected");
    this.activeScene = gameStore.getScene();
    this.render();
  }

  disconnectedCallback() {
    gameStore.unsubscribe(this.handleSceneChange.bind(this));
  }

  handleSceneChange(newScene) {
    this.activeScene = newScene;
    this.render();
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
          display: flex;
          pointer-events: none;
          z-index: 1001;
        }

        .menu {
          position: absolute;
          top: 1em;
          right: 1em;
          pointer-events: all;
        }
        .modes {
          position: absolute;
          bottom: 1em;
          right: 1em;
          pointer-events: all;
        }
      </style>

      <div class="menu">
        <scene-button data-scene="${scenes.INFO}" active="${
      this.activeScene === scenes.INFO
    }">ABOUT</scene-button>
      </div>
      <div class="modes">
        <index-button data-scene="${scenes.INDEX}" active="${
      this.activeScene === scenes.INDEX
    }"></index-button>
      </div>
    `;
  }
}

window.customElements.define("user-interface", UserInterface);
