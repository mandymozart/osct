import { GameStoreService } from "@/services/GameStoreService";
import { GameMode, IGame } from "@/types";
import { Scene } from "aframe";

/**
 * Scene Bridge provides a simplified api to the main Aframe scene.
 */
export class SceneBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private scene: Scene | null = null as unknown as Scene;
  private system: AFRAME.MindARImageSystem | null = null as unknown as AFRAME.MindARImageSystem

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.game = GameStoreService.getInstance();
  }

  connectedCallback() {
    this.scene = this.game.state.scene;
    this.setupListeners();
  }

  protected setupListeners() {
    this.game.subscribe(this.handleStateChange.bind(this));
  }

  private handleStateChange(state: { mode: GameMode }) {
    this.handleModeChange(state.mode);
  }

  private handleModeChange(mode: GameMode) {
    const isSceneMode = mode === GameMode.DEFAULT || GameMode.VR;
    isSceneMode ? this.activate() : this.deactive();
  }

  private activate() {
    // TODO: scene.play, show scene, check for scan lines
    // handle any dom related activities
    // refactor Scene Manager and move scene attachments
    // while loading resources here.
    // clear separation of state and view responsibility
    // for improved maintainance
    console.log("[Scene Bridge] activate scene mode");

    if (this.scene) {
      this.scene.play();
      this.scene.classList.add("active", "true");
    }
  }

  private deactive() {
    // TODO: scene.pause, hide scene, remove scanlines and loading
    console.log("[Scene Bridge] deactivate scene mode");

    if (this.scene) {
      this.scene.pause();
      this.scene.exitVR();
      this.scene.classList.remove("active");
    }
  }
}

customElements.define("scene-bridge", SceneBridge);
