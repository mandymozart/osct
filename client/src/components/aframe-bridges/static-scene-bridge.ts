import { GameStoreService } from "@/services/GameStoreService";
import { PreloaderService } from "@/services/PreloaderService";
import { SceneService } from "@/services/SceneService";
import { ErrorCode, IGame, ISceneService, SceneState } from "@/types";
import { waitForDOMReady } from "@/utils";
import { getOrCreateTemplate, getSceneState } from "./utils";
import { pauseAllVideos, playTargetVideos } from "./utils/videos";
import { registerChromaKeyShader } from "./utils/chroma-key";

// A-Frame (index.html) is loaded before the app modules; scenes may use the shader from the first load
registerChromaKeyShader();
import { Scene } from "aframe";

/**
 * StaticSceneBridge provides a bridge between the game state and static HTML scene templates.
 * Instead of dynamically creating scene elements, it injects pre-defined HTML templates.
 */
export class StaticSceneBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private sceneService: ISceneService;
  // Desired scene state (from mode + route); applied to each scene once MindAR is ready
  private sceneState: SceneState = SceneState.PAUSED;
  private currentSpread: string | null = null;
  private system: AFRAME.MindARImageSystem | null = null as unknown as AFRAME.MindARImageSystem;
  private sceneContainer: HTMLElement | null = null;
  private sceneElement: Scene | null = null;

  private initialized = false;
  private sceneInitialized = false;
  // MindAR emits `arReady` once the .mind targets are loaded. Before that, unpause() throws
  // (controller.markerDimensions is still null).
  private arReady = false;
  private sceneQueue: Promise<void> = Promise.resolve();
  private modeUnsubscribe: (() => void) | null = null;
  private routeUnsubscribe: (() => void) | null = null;
  private spreadUnsubscribe: (() => void) | null = null;

  // Templates are now generated dynamically from the game config
  private templates: Record<string, string> = {};

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.game = GameStoreService.getInstance();
    this.sceneService = SceneService.getInstance();
    this.setupScene();
  }

  connectedCallback() {
    this.setupSceneContainer();
  }

  disconnectedCallback() {
    if (this.modeUnsubscribe) {
      this.modeUnsubscribe();
      this.modeUnsubscribe = null;
    }

    if (this.routeUnsubscribe) {
      this.routeUnsubscribe();
      this.routeUnsubscribe = null;
    }
    
    if (this.spreadUnsubscribe) {
      this.spreadUnsubscribe();
      this.spreadUnsubscribe = null;
    }
    
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
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.game.startLoading()
    try {
      await waitForDOMReady();
      
      const currentSpread = this.game.spreads.getCurrentSpread() || 'spread2';
      
      if (currentSpread) {
        await this.createSceneForSpread(currentSpread);
        this.setupListeners();
      } else {
        console.warn("[StaticSceneBridge] No current spread to create scene for");
        this.initialized = false;
        this.game.notifyError({
          code: ErrorCode.SPREAD_NOT_FOUND,
          msg: "No spread available to load scene for"
        });
        return;
      }
      
      this.game.camera.checkPermission().catch(error => {
        console.warn("[StaticSceneBridge] Camera permission check failed:", error);
      });
      
      this.game.finishLoading();
    } catch (error) {
      this.game.notifyError({
        code: ErrorCode.SCENE_NOT_READY,
        msg: "Scene not ready." 
      });
      this.initialized = false;
    }
  }

  /**
   * Creates a new scene for the specified spread using static HTML templates
   * @param spreadId The spread ID to create a scene for
   */
  private async createSceneForSpread(spreadId: string): Promise<void> {
    this.game.startLoading();
    try {
      // Generate template from game config at runtime
      const template = getOrCreateTemplate(spreadId);
      
      if (!template) {
        throw new Error(`No template found for spread: ${spreadId}`);
      }
      
      await this.cleanupExistingScene();
      this.sceneInitialized = false;
      
      if (!this.sceneContainer) {
        throw new Error("Scene container not found");
      }
      
      this.sceneContainer.innerHTML = template;
      this.sceneElement = this.sceneContainer.querySelector('a-scene') as Scene;
      
      if (!this.sceneElement) {
        throw new Error("Could not find a-scene element in template");
      }

      this.arReady = false;
      const scene = this.sceneElement;
      scene.addEventListener("arReady", () => {
        if (scene !== this.sceneElement) return; // a newer spread replaced this scene
        this.arReady = true;
        // The active .mind is loaded: fetch the neighbouring spreads' .mind into the browser cache
        // (network only, the scene is not touched – RULES #4)
        PreloaderService.getInstance().preloadNeighbours(spreadId);
        // MindAR emits arReady and then starts tracking by itself (processVideo), so apply the
        // desired state on the next tick – otherwise a pause would be overridden right away
        setTimeout(() => {
          if (scene !== this.sceneElement) return;
          this.sceneState === SceneState.RUNNING ? this.activate() : this.deactivate();
        }, 0);
      });

      await this.waitForSceneToLoad();
      this.sceneService.setScene(this.sceneElement);
      this.system = this.sceneElement.systems["mindar-image-system"] as unknown as AFRAME.MindARImageSystem;
      
      if (!this.system) {
        console.warn("[StaticSceneBridge] MindAR system not available after scene load");
      }
      
      if (this.system && !this.system.controller) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      this.currentSpread = spreadId;
      
      if (this.sceneState === SceneState.RUNNING) {
        this.activate();
      }
    } catch (error) {
      console.error(`[StaticSceneBridge] Failed to create scene for spread ${spreadId}:`, error);
      this.game.notifyError({
        code: ErrorCode.FAILED_TO_UPDATE_SCENE,
        msg: `Failed to create scene for spread ${spreadId}`
      });
      throw error;
    }
    this.game.finishLoading();
  }
  
  /**
   * Clean up any existing scene
   */
  private async cleanupExistingScene(): Promise<void> {
    if (this.sceneElement) {
      this.deactivate();
      
      try {
        if (this.system) {
          try {
            this.system.pause();
            await new Promise(resolve => setTimeout(resolve, 50));
            
            if (typeof this.system.stop === 'function') {
              this.system.stop();
            } else if ((this.system as any).stop) {
              (this.system as any).stop();
            }
          } catch (e) {
            console.warn("[StaticSceneBridge] Error pausing/stopping MindAR:", e);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 150));
        this.sceneService.setScene(null);
        this.system = null as unknown as AFRAME.MindARImageSystem;
        this.sceneElement = null;
        
        if (this.sceneContainer) {
          this.cleanupMindAROverlays();
          this.sceneContainer.innerHTML = '';
        }
      } catch (e) {
        console.error("[StaticSceneBridge] Error during cleanup:", e);
      }
    }
  }
  
  /**
   * Clean up any MindAR-related overlays that are added to the DOM outside our scene container
   */
  private cleanupMindAROverlays(): void {
    const videoElements = this.sceneContainer?.querySelectorAll('video:not([id])');
    videoElements?.forEach(video => {
      try {
        const videoEl = video as HTMLVideoElement;
        if (videoEl.srcObject) {
          const stream = videoEl.srcObject as MediaStream;
          const tracks = stream.getTracks();
          tracks.forEach(track => {
            track.stop();
          });
        }
        videoEl.srcObject = null;
        videoEl.remove();
      } catch (e) {
        console.warn("[StaticSceneBridge] Error cleaning up video element:", e);
      }
    });
    
    const mindAROverlays = document.querySelectorAll('.mindar-ui-overlay');
    mindAROverlays.forEach(overlay => {
      overlay.remove();
    });
  }
  
  /**
   * Wait for scene to fully load
   */
  private async waitForSceneToLoad(): Promise<void> {
    if (!this.sceneElement) return;
    
    if (this.sceneElement.hasLoaded) {
      this.sceneInitialized = true;
      return;
    }
    
    return new Promise<void>((resolve) => {
      const loadHandler = () => {
        this.sceneElement?.removeEventListener('loaded', loadHandler);
        this.sceneInitialized = true;
        resolve();
      };
      if(this.sceneElement) {
        this.sceneElement.addEventListener('loaded', loadHandler);
      } else {
        console.error("[StaticSceneBridge] Scene element not found")
      }
    });
  }

  protected setupListeners() {
    // Scene state = f(mode, route): overlays pause the scene too
    this.modeUnsubscribe = this.game.subscribeToProperty("mode", () => this.applySceneState());
    this.routeUnsubscribe = this.game.subscribeToProperty("currentRoute", () => this.applySceneState());
    this.applySceneState();
    
    this.spreadUnsubscribe = this.game.subscribeToProperty("currentSpread", () => {
      // Load scenes one at a time. Each queued step loads the spread wanted *now*, so fast
      // switching skips stale spreads instead of racing (wrong scene, leaked camera streams).
      this.sceneQueue = this.sceneQueue.then(async () => {
        const spread = this.game.state.currentSpread;
        if (!spread || spread === this.currentSpread) return;
        try {
          await this.createSceneForSpread(spread);
        } catch (error) {
          console.error("[StaticSceneBridge] Error creating scene for new spread:", error);
        }
      });
    });
  }

  /**
   * Apply the scene state derived from the current mode and route (`utils/scene-state.ts`)
   */
  private applySceneState() {
    const next = getSceneState(this.game.state.mode, this.game.state.currentRoute);
    if (next === this.sceneState) return;
    this.sceneState = next;
    next === SceneState.RUNNING ? this.activate() : this.deactivate();
  }
  
  /**
   * Activate the scene mode
  */
  private activate() {
    if (!this.sceneElement || !this.system) {
      return;
    }
    
    this.game.camera.checkPermission().then(granted => {
      if (!granted || !this.system) {
        return;
      }

      // Not ready yet (or no longer wanted): the scene's arReady handler applies the state again
      if (!this.arReady || this.sceneState !== SceneState.RUNNING) {
        return;
      }

      window.document.body.classList.add("scene-active");
      
      try {
        this.system.unpause();
        if (this.sceneElement) {
          this.sceneElement.play();
          this.sceneElement.classList.add("active");
          // MindAR keeps its tracking state across a pause: resume videos of still tracked targets
          const scene = this.sceneElement;
          this.game.state.trackedTargets.forEach(id => playTargetVideos(scene, id));
        }
      } catch (error) {
        // Don't re-run setupScene() here: it rebuilds the scene and duplicates the store
        // listeners, which caused a reload loop when switching spreads.
        console.error("[StaticSceneBridge] Error during activation:", error);
      }
    });
  }

  /**
   * Pause the scene: stop tracking and the camera video (stream kept for an instant resume),
   * stop A-Frame ticks. The last frame stays visible behind the UI.
   */
  private deactivate() {
    if (!this.sceneElement || !this.system) {
      return;
    }

    // Before arReady MindAR has no controller yet (pause would throw); arReady calls us again
    if (this.arReady) {
      try {
        this.system.pause();
      } catch (error) {
        console.warn("[StaticSceneBridge] Error pausing MindAR:", error);
      }
    }
    this.sceneElement.pause();
    // No AR video (with sound) playing behind consultation pages or overlays
    pauseAllVideos(this.sceneElement);
    this.sceneElement.classList.remove("active");
    window.document.body.classList.remove("scene-active");
  }
}

customElements.define("static-scene-bridge", StaticSceneBridge);
