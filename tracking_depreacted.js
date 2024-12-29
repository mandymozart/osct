import { scenes } from "./scenes/index.js";
import { gameStore } from "./stores/GameStore.js";
import { trackingStore } from "./stores/TrackingStore.js";
import trackingTargets from "./targets/testingTargets.js";

class App {
  constructor() {
    this.sceneElements = {
      [scenes.INFO]: document.getElementById("info-scene"),
      [scenes.INDEX]: document.getElementById("index-scene"),
    };
    this.userInterface = document.getElementById("user-interface");
    this.currentScene = gameStore.getScene();
  }

  init() {
    this.updateSceneVisibility();
    this.setupEventListeners();
    this.initTracking();
  }

  updateSceneVisibility() {
    if (this.currentScene === null) {
      Object.keys(this.sceneElements).forEach((key) => {
        this.sceneElements[key].classList.remove("active");
      });
      return;
    }

    Object.keys(this.sceneElements).forEach((key) => {
      if (key === this.currentScene) {
        this.sceneElements[key].classList.add("active");
      } else {
        this.sceneElements[key].classList.remove("active");
      }
    });
  }

  setupEventListeners() {
    gameStore.subscribe((newScene) => {
      this.currentScene = newScene;
      this.updateSceneVisibility();
    });

    this.userInterface.addEventListener("change-scene", (event) => {
      this.currentScene = event.detail.scene;
      gameStore.setScene(this.currentScene);
      this.updateSceneVisibility();
    });
  }

  initTracking() {
    document.addEventListener("DOMContentLoaded", () => {
      const sceneEl = document.querySelector("a-scene");

      if (!sceneEl) {
        console.error("Scene element not found");
        return;
      }

      sceneEl.addEventListener("loaded", () => {
        const arSystem = sceneEl.systems["mindar-image-system"];

        if (!arSystem) {
          console.error("MindAR system not found");
          return;
        }

        // Listen for MindAR system events
        sceneEl.addEventListener("arReady", () => console.log("MindAR ready"));
        sceneEl.addEventListener("arError", () =>
          console.error("MindAR error")
        );

        // Set up target event listeners
        for (let i = 1; i <= 5; i++) {
          const targetEl = document.querySelector(`#target-${i}`);
          if (!targetEl) continue;

          targetEl.addEventListener("targetFound", (event) => {
            console.log(`Target Found: ${i}`);
            alert("Target Found");

            trackingStore.addTarget(i);
            const targetInfo = trackingTargets[i];
            console.log("Target Info:", targetInfo);
          });

          targetEl.addEventListener("targetLost", () => {
            console.log(`Target Lost: ${i}`);
            trackingStore.removeTarget(i);
          });
        }
      });

      trackingStore.subscribe((newState) => {
        console.log("TrackingStore state changed:", newState);
      });
    });
  }
}

const app = new App();
app.init();
