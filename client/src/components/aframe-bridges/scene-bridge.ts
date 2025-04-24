import { GameStoreService } from "@/services/GameStoreService";
import { SceneService } from "@/services/SceneService";
import { ErrorCode, GameMode, GameState, IGame, ISceneService } from "@/types";
import { waitForDOMReady } from "@/utils";
import { Scene } from "aframe";

/**
 * SceneBridge provides a simplified API to the main Aframe scene.
 * Handles A-Frame DOM interactions including asset element creation and monitoring.
 */
export class SceneBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private sceneService: ISceneService;
  private currentMode: GameMode | null = null;
  private scene: Scene | null = null as unknown as Scene; // TODO: Redundant
  private system: AFRAME.MindARImageSystem | null = null as unknown as AFRAME.MindARImageSystem

  private initialized = false;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.game = GameStoreService.getInstance();
    this.sceneService = SceneService.getInstance();
    this.setupScene();
  }

  connectedCallback() {
    this.setupListeners();
  }

  protected async setupScene() {
    // Prevent multiple initialization attempts
    if (this.initialized) {
      console.log("[SceneBridge] Scene setup already in progress or completed");
      return;
    }
    this.initialized = true;

    try {
      await waitForDOMReady();
      
      // Make sure we can find the scene element
      const sceneElement = document.querySelector("#scene");
      if (!sceneElement) {
        console.error("[SceneBridge] Cannot find scene element with ID 'scene'");
        this.initialized = false; // Reset so we can try again
        return;
      }
      
      // Use SceneManager to attach scene
      await this.attachScene("#scene");
      this.scene = this.sceneService.getScene() as Scene;
      
      if (!this.scene) {
        console.error("[SceneBridge] Scene not attached correctly");
        this.initialized = false; // Reset so we can try again
        return;
      }
      this.game.finishLoading()
      
      this.system = this.scene?.systems["mindar-image-system"] as unknown as AFRAME.MindARImageSystem;
      
      // Check camera permission in the background without blocking
      this.game.camera.checkPermission().catch(error => {
        console.warn("[SceneBridge] Camera permission check failed:", error);
      });
    } catch (error) {
      // Report errors through SceneManager
      this.game.notifyError({
        code: ErrorCode.SCENE_NOT_READY,
        msg: "Scene not ready." 
      });
      this.initialized = false; // Reset so we can try again
    }
  }

  protected setupListeners() {
    this.game.subscribe(this.handleStateChange.bind(this));
  }

  private handleStateChange(state: GameState) {
    if (state.mode !== this.currentMode && this.system) {
      this.handleModeChange(state.mode);
    }
  }

   /**
   * Attach an A-Frame scene to the store
   * @param scene Scene instance or DOM selector
   */
   public async attachScene(selector: string, timeoutMs = 10000): Promise<void> {
    try {
      await waitForDOMReady();
      // Get scene element
      const scene =
        typeof selector === "string"
          ? (document.querySelector(selector) as Scene)
          : selector;

      if (!scene) {
        throw new Error(`Scene not found: ${selector}`);
      }

      // Wait for scene to be ready if not already loaded
      if (!scene.hasLoaded) {
        await Promise.race([
          new Promise<void>((resolve) => {
            const handler = () => {
              scene.removeEventListener("loaded", handler);
              resolve();
            };
            scene.addEventListener("loaded", handler);
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Scene loading timed out after " + timeoutMs + "ms"));
            }, timeoutMs);
          })
        ]);
      }

      // Store scene reference
      this.sceneService.setScene(scene);
      console.log("[SceneBridge] A-Frame ready");
    } catch (error) {
      console.error("[SceneBridge] Failed to attach scene:", error);
      this.game.notifyError({
        code: ErrorCode.SCENE_NOT_FOUND,
        msg: error instanceof Error ? error.message : "Failed to attach scene"
      });
      throw error;
    }
  }

  /**
   * Handle game mode changes
   * @param mode New game mode
   */
  private handleModeChange(mode: GameMode) {
    const isSceneMode = mode === GameMode.DEFAULT || mode === GameMode.VR;
    this.currentMode = mode;
    isSceneMode ? this.activate() : this.deactivate();
  }
  
  /**
   * Activate the scene mode
  */
 private activate() {
   if (this.scene !== null) {
     this.game.camera.checkPermission().then(granted => {
       if (granted && this.system) {
          console.log(`[SceneBridge] Activate`)
          window.document.body.classList.add("scene-active");
          this.system.unpause();
          this.scene?.play();
          this.scene?.classList.add("active", "true");
        }
      });
    }
  }

  /**
   * Deactivate the scene mode
   */
  private deactivate() {
    if(this.scene === null || this.system === null) {
      console.log("[SceneBridge] Scene or system not found")
      return
    }
    console.log(`[SceneBridge] Deactivate`)
    this.scene.exitVR();
    this.scene.pause();
    this.scene.classList.remove("active");
    window.document.body.classList.remove("scene-active");
  }
}

customElements.define("scene-bridge", SceneBridge);
