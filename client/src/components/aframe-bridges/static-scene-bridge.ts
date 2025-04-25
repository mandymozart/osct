import { GameStoreService } from "@/services/GameStoreService";
import { SceneService } from "@/services/SceneService";
import { ErrorCode, GameMode, IGame, ISceneService } from "@/types";
import { waitForDOMReady } from "@/utils";
import { getOrCreateTemplate } from "./utils";
import { Scene } from "aframe";

/**
 * StaticSceneBridge provides a bridge between the game state and static HTML scene templates.
 * Instead of dynamically creating scene elements, it injects pre-defined HTML templates.
 */
export class StaticSceneBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private sceneService: ISceneService;
  private currentMode: GameMode | null = null;
  private currentChapter: string | null = null;
  private system: AFRAME.MindARImageSystem | null = null as unknown as AFRAME.MindARImageSystem;
  private sceneContainer: HTMLElement | null = null;
  private sceneElement: Scene | null = null;

  private initialized = false;
  private sceneInitialized = false;
  private modeUnsubscribe: (() => void) | null = null;
  private chapterUnsubscribe: (() => void) | null = null;

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
    
    if (this.chapterUnsubscribe) {
      this.chapterUnsubscribe();
      this.chapterUnsubscribe = null;
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
      
      const currentChapter = this.game.chapters.getCurrentChapter() || 'chapter2';
      
      if (currentChapter) {
        await this.createSceneForChapter(currentChapter);
        this.setupListeners();
      } else {
        console.warn("[StaticSceneBridge] No current chapter to create scene for");
        this.initialized = false;
        this.game.notifyError({
          code: ErrorCode.CHAPTER_NOT_FOUND,
          msg: "No chapter available to load scene for"
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
   * Creates a new scene for the specified chapter using static HTML templates
   * @param chapterId The chapter ID to create a scene for
   */
  private async createSceneForChapter(chapterId: string): Promise<void> {
    this.game.startLoading();
    try {
      // Generate template from game config at runtime
      const template = getOrCreateTemplate(chapterId);
      
      if (!template) {
        throw new Error(`No template found for chapter: ${chapterId}`);
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
      this.currentChapter = chapterId;
      
      if (this.currentMode === GameMode.DEFAULT || this.currentMode === GameMode.VR) {
        this.activate();
      }
    } catch (error) {
      console.error(`[StaticSceneBridge] Failed to create scene for chapter ${chapterId}:`, error);
      this.game.notifyError({
        code: ErrorCode.FAILED_TO_UPDATE_SCENE,
        msg: `Failed to create scene for chapter ${chapterId}`
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
    
    ['mindar-ui-loading', 'mindar-ui-container', 'mindar-ui-scanning'].forEach(className => {
      const elements = document.querySelectorAll(`.${className}`);
      if (elements.length > 0) {
        elements.forEach(el => el.remove());
      }
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
    this.modeUnsubscribe = this.game.subscribeToProperty("mode", (mode) => {
      if (mode !== this.currentMode) {
        this.handleModeChange(mode);
      }
    });
    
    this.chapterUnsubscribe = this.game.subscribeToProperty("currentChapter", async (chapter) => {
      if (chapter && chapter !== this.currentChapter) {
        if (this.sceneInitialized) {
          try {
            await this.createSceneForChapter(chapter);
          } catch (error) {
            console.error("[StaticSceneBridge] Error creating scene for new chapter:", error);
          }
        } else {
          console.log("[StaticSceneBridge] Received chapter change but scene not yet initialized, deferring update");
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
    if (!this.sceneElement || !this.system) {
      return;
    }
    
    this.game.camera.checkPermission().then(granted => {
      if (!granted || !this.system) {
        return;
      }
      
      if (!this.system.controller) {
        setTimeout(() => {
          this.activate();
        }, 300);
        return;
      }
      
      window.document.body.classList.add("scene-active");
      
      try {
        this.system.unpause();
        if (this.sceneElement) {
          this.sceneElement.play();
          this.sceneElement.classList.add("active");
        }
      } catch (error) {
        console.error("[StaticSceneBridge] Error during activation:", error);
        this.initialized = false;
        this.sceneInitialized = false;
        this.setupScene();
      }
    });
  }

  /**
   * Deactivate the scene mode
   */
  private deactivate() {
    if (!this.sceneElement || !this.system) {
      return;
    }
    
    this.sceneElement.exitVR();
    this.sceneElement.pause();
    this.sceneElement.classList.remove("active");
    window.document.body.classList.remove("scene-active");
  }
}

customElements.define("static-scene-bridge", StaticSceneBridge);
