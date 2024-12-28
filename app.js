import { scenes } from "./scenes/index.js";

const sceneElements = {
  [scenes.HOME]: document.getElementById("home-scene"),
  [scenes.BOOK]: document.getElementById("book-scene"),
  [scenes.INDEX]: document.getElementById("index-scene"),
};

const userInterface = document.getElementById("user-interface");
let currentScene = scenes.HOME;

function updateSceneVisibility() {
  Object.keys(sceneElements).forEach((key) => {
    if (key === currentScene) {
      sceneElements[key].classList.add("active");
    } else {
      sceneElements[key].classList.remove("active");
    }
  });
}

userInterface.addEventListener("change-scene", (event) => {
  currentScene = event.detail.scene;
  updateSceneVisibility();
});

updateSceneVisibility();
