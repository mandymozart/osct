import { GameStoreService } from "@/services/GameStoreService";
import { SceneService } from "@/services/SceneService";
import { ErrorCode, GameMode, GameState, IGame, ISceneService } from "@/types";
import { waitForDOMReady } from "@/utils";
import { Scene } from "aframe";
import { connectScene } from "./utils/connectScene";
import { createScene } from "./utils/createScene";

/**
 * SceneBridge provides a simplified API to the main Aframe scene.
 * Handles A-Frame DOM interactions including asset element creation and monitoring.
 */
export class SceneBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private sceneService: ISceneService;
  private currentMode: GameMode | null = null;
  private currentChapter: string | null = null;
  private system: AFRAME.MindARImageSystem | null = null as unknown as AFRAME.MindARImageSystem;
  private sceneContainer: HTMLElement | null = null;

  private initialized = false;
  private modeUnsubscribe: (() => void) | null = null;
  private chapterUnsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.game = GameStoreService.getInstance();
    this.sceneService = SceneService.getInstance();
    this.setupScene();
  }

  connectedCallback() {
    this.setupListeners();
    this.setupSceneContainer();
  }

  disconnectedCallback() {
    // Clean up subscriptions when component is removed
    if (this.modeUnsubscribe) {
      this.modeUnsubscribe();
      this.modeUnsubscribe = null;
    }
    
    if (this.chapterUnsubscribe) {
      this.chapterUnsubscribe();
      this.chapterUnsubscribe = null;
    }
    
    // Reset scene in service
    this.sceneService.setScene(null);
  }
  
  /**
   * Create a container div for the scene if it doesn't exist
   */
  private setupSceneContainer() {
    this.sceneContainer = document.getElementById('scene-container');
    if (!this.sceneContainer) {
      this.sceneContainer = document.createElement('div');
      this.sceneContainer.id = 'scene-container';
      document.body.appendChild(this.sceneContainer);
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
      
      // Check if there's an existing scene in the DOM first
      const existingScene = await connectScene(
        "#scene", 
        5000, 
        (code, msg) => {
          console.log(`[SceneBridge] No existing scene found, will create dynamically`);
        }
      );
      
      if (existingScene) {
        // Use the existing scene
        this.sceneService.setScene(existingScene);
        console.log("[SceneBridge] Connected to existing scene");
      } else {
        // No existing scene, get the current chapter and create one
        const currentChapter = this.game.chapters.getCurrentChapter();
        if (currentChapter) {
          await this.createSceneForChapter(currentChapter);
        } else {
          console.warn("[SceneBridge] No current chapter to create scene for");
        }
      }
      
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

  /**
   * Creates a new scene for the specified chapter
   * @param chapterId The chapter ID to create a scene for
   */
  private async createSceneForChapter(chapterId: string): Promise<void> {
    try {
      console.log(`[SceneBridge] Creating new scene for chapter: ${chapterId}`);
      
      // Remove any existing scene from the DOM
      const oldScene = this.sceneService.getScene();
      if (oldScene) {
        this.deactivate();
        oldScene.parentNode?.removeChild(oldScene);
        this.sceneService.setScene(null);
      }
      
      // Create new scene
      const newScene = createScene(chapterId);
      
      // Add to DOM
      if (this.sceneContainer) {
        this.sceneContainer.appendChild(newScene);
      } else {
        document.body.appendChild(newScene);
      }
      
      // Wait for the scene to load
      await new Promise<void>((resolve) => {
        if (newScene.hasLoaded) {
          resolve();
        } else {
          newScene.addEventListener('loaded', () => resolve());
        }
      });
      
      // Set in service
      this.sceneService.setScene(newScene);
      
      // Update mindar system reference
      this.system = newScene.systems["mindar-image-system"] as unknown as AFRAME.MindARImageSystem;
      
      // Mark current chapter
      this.currentChapter = chapterId;
      
      console.log(`[SceneBridge] Scene created and loaded for chapter: ${chapterId}`);
      
      // Reactivate if we were previously in scene mode
      if (this.currentMode === GameMode.DEFAULT || this.currentMode === GameMode.VR) {
        this.activate();
      }
    } catch (error) {
      console.error(`[SceneBridge] Failed to create scene for chapter ${chapterId}:`, error);
      this.game.notifyError({
        code: ErrorCode.FAILED_TO_UPDATE_SCENE,
        msg: `Failed to create scene for chapter ${chapterId}`
      });
      throw error;
    }
  }

  protected setupListeners() {
    // Subscribe to mode changes
    this.modeUnsubscribe = this.game.subscribeToProperty("mode", (mode) => {
      if (mode !== this.currentMode && this.system) {
        this.handleModeChange(mode);
      }
    });
    
    // Subscribe to chapter changes
    this.chapterUnsubscribe = this.game.subscribeToProperty("currentChapter", async (chapter) => {
      if (chapter && chapter !== this.currentChapter) {
        try {
          await this.createSceneForChapter(chapter);
        } catch (error) {
          console.error("[SceneBridge] Error creating scene for new chapter:", error);
        }
      }
    });
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
