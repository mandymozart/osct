import { GameStoreService } from "@/services/GameStoreService";
import { ErrorCode, GameMode, IGame } from "@/types";
import { waitForDOMReady } from "@/utils";
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
    this.setupScene();
  }

  connectedCallback() {
    this.scene = this.game.state.scene;
    this.system = this.scene?.systems["mindar-image-system"] as unknown as AFRAME.MindARImageSystem;
    this.setupListeners();
  }

  protected async setupScene() {
    try {
      await waitForDOMReady();
      await this.game.scene.attachScene("#scene");
      
      // Complete loading immediately, regardless of camera permission
      this.game.finishLoading();
      
      // Check camera permission in the background without blocking
      this.game.camera.checkPermission().catch(error => {
        console.warn("[Scene Bridge] Camera permission check failed:", error);
      });
    } catch (error) {
      this.game.notifyError({
        code: ErrorCode.SCENE_NOT_FOUND,
        msg: "Failed to attach scene",
      });
      this.game.finishLoading(); // Still finish loading even if scene fails
    }
  }

  protected setupListeners() {
    this.game.subscribe(this.handleStateChange.bind(this));
  }

  private handleStateChange(state: { mode: GameMode }) {
    this.handleModeChange(state.mode);
  }

  private handleModeChange(mode: GameMode) {
    const isSceneMode = mode === GameMode.DEFAULT || GameMode.VR;
    // skip change if game is initialized or in idle mode
    if(!GameMode.IDLE || !this.scene || !this.system) return;
    isSceneMode ? this.activate() : this.deactivate();
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
      this.game.camera.checkPermission().then(granted => {
        if (granted) {
          this.scene?.play();
          this.scene?.classList.add("active", "true");
        }
      });
    }
  }

  private deactivate() {
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
