import { SceneButton } from "./scene-button.js";
import { gameStore } from "./../stores/GameStore.js";
import trackingTargets from "./../targets/testingTargets.js";

class IndexButton extends SceneButton {
  constructor() {
    super();
    this.updateButtonText = this.updateButtonText.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    gameStore.subscribe(this.updateButtonText);
    this.updateButtonText();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    gameStore.unsubscribe(this.updateButtonText);
  }

  updateButtonText() {
    console.log("Updating button text");
    const buttonText = this.getButtonText();
    this.shadowRoot.querySelector("button").textContent = buttonText;
  }

  getButtonText() {
    // Get the number of targets with the mode 'index'
    const indexTargets = gameStore.getTargets().filter((targetId) => {
      const target = trackingTargets[targetId];
      return target && target.mode === "index";
    });
    const indexCount = indexTargets.length;

    // Return the appropriate text based on the index count
    return indexCount > 1
      ? `${this._active ? "Hide" : "View"} ${indexCount} Indexes`
      : "View Index";
  }
}

window.customElements.define("index-button", IndexButton);
