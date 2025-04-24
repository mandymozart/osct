import { Scene } from "aframe";
import { ISceneService } from "@/types";

/**
 * Service for handling the A-Frame Scene instance
 * Keeps the Scene instance outside of the immutable state
 */
export class SceneService implements ISceneService {
  private static instance: SceneService;
  private sceneInstance: Scene | null = null;
  private sceneReadyCallbacks: Array<(scene: Scene) => void> = [];

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
   * Get the current A-Frame scene instance
   */
  public getScene(): Scene | null {
    return this.sceneInstance;
  }

  /**
   * Set the A-Frame scene instance
   * @param scene The A-Frame scene to set
   */
  public setScene(scene: Scene): void {
    this.sceneInstance = scene;
    
    // Notify any callbacks waiting for the scene
    this.notifySceneReady();
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
}

// Export a singleton instance
export const sceneService = SceneService.getInstance();
