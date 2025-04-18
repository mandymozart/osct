import { GameStoreService } from "@/services/GameStoreService";
import { ErrorCode, GameMode, IGame } from "@/types";
import { waitForDOMReady } from "@/utils";
import { Scene } from "aframe";

/**
 * Scene Bridge provides a simplified api to the main Aframe scene.
 */
export class SceneBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private currentMode: GameMode | null = null;
  private scene: Scene | null = null as unknown as Scene;
  private system: AFRAME.MindARImageSystem | null = null as unknown as AFRAME.MindARImageSystem

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.game = GameStoreService.getInstance();
    this.setupScene();
  }

  connectedCallback() {
    this.setupListeners();
  }

  protected async setupScene() {
    try {
      await waitForDOMReady();
      await this.game.scene.attachScene("#scene");
      this.scene = this.game.state.scene;
      this.system = this.scene?.systems["mindar-image-system"] as unknown as AFRAME.MindARImageSystem;
      
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
    if(state.mode !== this.currentMode && this.system) {
      this.handleModeChange(state.mode);
    }
  }

  private handleModeChange(mode: GameMode) {
    const isSceneMode = mode === GameMode.DEFAULT || mode === GameMode.VR;
    console.log("[Scene Bridge] Mode:", mode, isSceneMode ? "isSceneMode" : "isNotSceneMode")
    this.currentMode = mode;
    isSceneMode ? this.activate() : this.deactivate();
  }

  private activate() {
    // TODO: scene.play, show scene, check for scan lines
    // handle any dom related activities
    // refactor Scene Manager and move scene attachments
    // while loading resources here.
    // clear separation of state and view responsibility
    // for improved maintainance
    console.log("[Scene Bridge] activate scene mode:", this.system?.video.style);

    if (this.scene !== null) {
      this.game.camera.checkPermission().then(granted => {
        if (granted && this.system) {
          window.document.body.classList.add("scene-active");
          this.system.unpause();
          this.scene?.play();
          this.scene?.classList.add("active", "true");
        }
      });
    }
  }

  private deactivate() {
    // TODO: scene.pause, hide scene, remove scanlines and loading
    console.log("[Scene Bridge] deactivate scene mode:", this.currentMode);
    if(this.scene === null || this.system === null) {
      console.log("[Scene Bridge] Scene or system not found")
      return
    }
    this.scene.exitVR();
    this.scene.pause();
    this.scene.classList.remove("active");
    window.document.body.classList.remove("scene-active");
    // setTimeout(() => {
    //   this.system?.pause();
    //   this.system.video.style.opacity = "0";
    // }, 1000);
  }
}

customElements.define("scene-bridge", SceneBridge);
