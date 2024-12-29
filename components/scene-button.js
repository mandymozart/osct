const gameStore = document.gameStore;

export class SceneButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._active = false;
  }

  connectedCallback() {
    this.updateActiveState();

    this.render();

    gameStore.subscribe(this.handleSceneChange.bind(this));

    this.addEventListener("click", this.handleClick);
  }

  disconnectedCallback() {
    gameStore.unsubscribe(this.handleSceneChange.bind(this));
  }

  handleSceneChange() {
    this.updateActiveState();
    this.render();
  }

  updateActiveState() {
    const scene = this.getAttribute("data-scene");
    const currentScene = gameStore.getScene();
    this._active = currentScene === scene;
  }

  handleClick() {
    const scene = this.getAttribute("data-scene");
    const currentScene = gameStore.getScene();
    gameStore.setScene(currentScene === scene ? null : scene);
  }

  render() {
    const activeClass = this._active ? "active" : "";
    const buttonText = this.getButtonText(); // Call the overridden method

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        button {
          font-weight: 500;
          color: var(--color-primary);
          text-decoration: inherit;
          border-radius: 1em;
          border: 1px solid var(--color-primary);
          padding: 0 1em;
          font-size: 1em;
          font-weight: 500;
          line-height: 2em;
          font-family: inherit;
          background-color: var(--color-background);
          cursor: pointer;
          transition: border-color 0.25s;
        }

        button:hover {
          border-color: var(--color-secondary);
          color: var(--color-secondary);
        }

        button:focus,
        button:focus-visible {
          outline: 4px auto -webkit-focus-ring-color;
        }

        .active {
          border-color: var(--color-secondary);
          background-color: var(--color-background);
          color: var(--color-secondary);
        }
      </style>

      <button class="${activeClass}">
        ${buttonText}  <!-- Directly use buttonText without slot -->
      </button>
    `;
  }

  // Default implementation of getButtonText, which can be overridden by child classes
  getButtonText() {
    return this.textContent.trim() || "Button"; // Default to "Button" if no content
  }
}

window.customElements.define("scene-button", SceneButton);
