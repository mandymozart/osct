import { Scene } from "aframe";
import { router } from "@/router";
import { GameMode, ISceneService, PageRoute, SceneState } from "@/types";

/**
 * Scene state per game mode (PLAN Phase 2 "Modes vs views").
 * IDLE should be STOPPED (camera released) – that needs MindAR `autoStart: false`
 * (Phase 5 "Grant access" / Phase 6), until then the camera is already running, so PAUSED.
 */
export const SCENE_STATE_BY_MODE: Record<GameMode, SceneState> = {
  [GameMode.IDLE]: SceneState.PAUSED,
  [GameMode.SCAN]: SceneState.RUNNING,
  [GameMode.CONSULTATION]: SceneState.PAUSED,
};

/**
 * Service for handling the A-Frame Scene instance
 * Keeps the Scene instance outside of the immutable state, and decides what the scene should be
 * doing for the app state (`getSceneState`); the scene bridge applies it to the DOM.
 */
export class SceneService implements ISceneService {
  private static instance: SceneService;
  private sceneInstance: Scene | null = null;
  private sceneReadyCallbacks: Array<(scene: Scene) => void> = [];
  private sceneChangeCallbacks: Array<(scene: Scene) => void> = [];

  /**
   * Get the singleton instance of SceneService
   */
  public static getInstance(): SceneService {
    if (!SceneService.instance) {
      SceneService.instance = new SceneService();
    }
    return SceneService.instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Overlays are routes without a mode of their own (error, not-found)
   */
  public isOverlayRoute(route: PageRoute | null): boolean {
    return !!route && !router.routes.find(r => r.page === route.page)?.mode;
  }

  /**
   * What the scene should be doing for a mode and the current route.
   * An overlay pauses the scene at most: saves resources and keeps targets from being found
   * (found indicator, videos with sound) behind a page the user is reading.
   */
  public getSceneState(mode: GameMode, route: PageRoute | null): SceneState {
    const byMode = SCENE_STATE_BY_MODE[mode];
    return this.isOverlayRoute(route) ? Math.min(byMode, SceneState.PAUSED) : byMode;
  }

  /**
   * Get the current A-Frame scene instance
   */
  public getScene(): Scene | null {
    return this.sceneInstance;
  }

  /**
   * Set the A-Frame scene instance
   * @param scene The A-Frame scene to set
   */
  public setScene(scene: Scene | null): void {
    const previousScene = this.sceneInstance;
    this.sceneInstance = scene;
    
    // Only notify scene change if we have a new scene and it's different from the previous one
    if (scene && scene !== previousScene) {
      // Notify any callbacks waiting for scene changes
      this.notifySceneChanged();
    }
    
    // Only notify ready callbacks if this is a new scene (not null)
    if (scene) {
      // Notify any callbacks waiting for the scene
      this.notifySceneReady();
    }
  }

  /**
   * Register a callback for when the scene becomes available
   * @param callback Function to call when scene is ready
   * @returns Cleanup function to unregister the callback
   */
  public onSceneReady(callback: (scene: Scene) => void): () => void {
    if (this.sceneInstance) {
      callback(this.sceneInstance);
    } else {
      this.sceneReadyCallbacks.push(callback);
    }
    
    return () => {
      const index = this.sceneReadyCallbacks.indexOf(callback);
      if (index !== -1) {
        this.sceneReadyCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register a callback for when the scene changes
   * @param callback Function to call when scene changes
   * @returns Cleanup function to unregister the callback
   */
  public onSceneChanged(callback: (scene: Scene) => void): () => void {
    this.sceneChangeCallbacks.push(callback);
    
    return () => {
      const index = this.sceneChangeCallbacks.indexOf(callback);
      if (index !== -1) {
        this.sceneChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all registered callbacks that the scene is ready
   */
  private notifySceneReady(): void {
    if (!this.sceneInstance) return;
    
    // Call all callbacks
    this.sceneReadyCallbacks.forEach(callback => {
      callback(this.sceneInstance!);
    });
    
    // Clear the callback list as they've all been notified
    this.sceneReadyCallbacks = [];
  }
  
  /**
   * Notify all registered callbacks that the scene has changed
   */
  private notifySceneChanged(): void {
    if (!this.sceneInstance) return;
    
    // Call all callbacks
    this.sceneChangeCallbacks.forEach(callback => {
      callback(this.sceneInstance!);
    });
  }
}

// Export a singleton instance
export const sceneService = SceneService.getInstance();
