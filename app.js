import { gameStore } from "./stores/GameStore.js";
import { scenes } from "./scenes/index.js";
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
    this.initializeStore();
    this.updateSceneVisibility();
    this.setupEventListeners();
    this.initTracking();
  }

  initializeStore() {
    gameStore.initialize();

    if (!document.gameStore) {
      Object.defineProperty(document, "gameStore", {
        value: gameStore,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }
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
    gameStore.subscribe((newState) => {
      this.currentScene = newState.scene;
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

      const handleError = (message, error) => {
        if (error.detail.error === "VIDEO_FAIL") {
          const errorScreen = document.getElementById("error-screen");
          if (errorScreen) {
            errorScreen.active = true;
          }
          console.error("Please enable camera access to use this app");
        } else {
          console.error(message, error);
        }
      };

      sceneEl.addEventListener("loaded", () => {
        const arSystem = sceneEl.systems["mindar-image-system"];

        if (!arSystem) {
          console.error("MindAR system not found");
          return;
        }

        // Listen for MindAR system events
        sceneEl.addEventListener("arReady", () => console.log("MindAR ready"));
        sceneEl.addEventListener("arError", (error) =>
          handleError("MindAR error", error)
        );

        // Set up target event listeners
        for (let i = 1; i <= 5; i++) {
          const targetEl = document.querySelector(`#target-${i}`);
          if (!targetEl) continue;

          targetEl.addEventListener("targetFound", (event) => {
            console.log(`Target Found: ${i}`);
            const target = trackingTargets[i];

            if (target) {
              gameStore.addTarget(i);
            } else {
              console.warn(`Target ${i} not found in trackingTargets`);
            }
          });

          targetEl.addEventListener("targetLost", () => {
            console.log(`Target Lost: ${i}`);
            gameStore.removeTarget(i);
          });
        }
      });

      gameStore.subscribe((newState) => {
        console.log("GameStore state changed:", newState);
      });
    });
  }
}

const app = new App();
app.init();
document.app = app;
