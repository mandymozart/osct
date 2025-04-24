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
  private system: AFRAME.MindARImageSystem | null = null as unknown as AFRAME.MindARImageSystem

  private initialized = false;
  private unsubscribe: (() => void) | null = null;

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

  disconnectedCallback() {
    // Clean up subscription when component is removed
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
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
      
      // Initialize A-Frame scene via SceneService
      await this.attachScene("#scene");
      
      // Get scene from SceneService
      const scene = this.sceneService.getScene();
      
      if (!scene) {
        console.error("[SceneBridge] Scene not attached correctly");
        this.initialized = false; // Reset so we can try again
        return;
      }
      
      this.game.finishLoading();
      
      // Get the mindar system reference
      this.system = scene.systems["mindar-image-system"] as unknown as AFRAME.MindARImageSystem;
      
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
    // Use property-specific subscription for better performance
    this.unsubscribe = this.game.subscribeToProperty("mode", (mode) => {
      if (mode !== this.currentMode && this.system) {
        this.handleModeChange(mode);
      }
    });
  }

  /**
   * Attach an A-Frame scene to the store
   * @param selector Scene DOM selector
   */
  public async attachScene(selector: string, timeoutMs = 10000): Promise<void> {
    try {
      await waitForDOMReady();
      
      // Get scene element
      const sceneElement = document.querySelector(selector) as Scene;
      
      if (!sceneElement) {
        throw new Error(`Scene not found: ${selector}`);
      }

      // Wait for scene to be ready if not already loaded
      if (!sceneElement.hasLoaded) {
        await Promise.race([
          new Promise<void>((resolve) => {
            const handler = () => {
              sceneElement.removeEventListener("loaded", handler);
              resolve();
            };
            sceneElement.addEventListener("loaded", handler);
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Scene loading timed out after " + timeoutMs + "ms"));
            }, timeoutMs);
          })
        ]);
      }

      // Store scene reference in SceneService
      this.sceneService.setScene(sceneElement);
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
    const scene = this.sceneService.getScene();
    if (!scene) return;
    
    this.game.camera.checkPermission().then(granted => {
      if (granted && this.system) {
        console.log(`[SceneBridge] Activate`);
        window.document.body.classList.add("scene-active");
        this.system.unpause();
        scene.play();
        scene.classList.add("active", "true");
      }
    });
  }

  /**
   * Deactivate the scene mode
   */
  private deactivate() {
    const scene = this.sceneService.getScene();
    if (!scene || !this.system) {
      console.log("[SceneBridge] Scene or system not found");
      return;
    }
    
    console.log(`[SceneBridge] Deactivate`);
    scene.exitVR();
    scene.pause();
    scene.classList.remove("active");
    window.document.body.classList.remove("scene-active");
  }
}

customElements.define("scene-bridge", SceneBridge);
