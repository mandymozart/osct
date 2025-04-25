import { GameStoreService } from "@/services/GameStoreService";
import { SceneService } from "@/services/SceneService";
import { IGame, ISceneService } from "@/types";
import { setupTargetListeners } from "./utils";

/**
 * TargetBridge connects MindAR target events to the game state.
 * It sets up event listeners on targets after a scene is fully loaded
 * and handles cleanup when scenes change.
 */
export class TargetBridge extends HTMLElement {
  private sceneService: ISceneService;
  private cleanupListeners: (() => void) | null = null;
  private initialized = false;
  private sceneChangeUnsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.sceneService = SceneService.getInstance();
    this.setupSubscriptions();
  }

  connectedCallback() {
    if (!this.initialized) {
      this.initialized = true;
      this.connectToCurrentScene();
    }
  }

  disconnectedCallback() {
    this.cleanup();
  }

  /**
   * Set up subscriptions to scene changes
   */
  private setupSubscriptions(): void {
    // Subscribe to scene changes - this is more efficient than polling
    this.sceneChangeUnsubscribe = this.sceneService.onSceneChanged(
      this.handleSceneChange.bind(this));
  }
  
  /**
   * Handle scene changes
   */
  private handleSceneChange(scene: HTMLElement): void {
    if (scene) {
      console.log(`[TargetBridge] Scene changed, reconnecting targets`);
      this.connectToCurrentScene();
    }
  }

  /**
   * Connect to the current scene and set up target listeners
   */
  private connectToCurrentScene(): void {
    // Always clean up existing listeners before setting up new ones
    this.cleanupTargetListeners();
    
    // Get the current scene from the SceneService
    const sceneElement = this.sceneService.getScene();
    
    if (!sceneElement) {
      console.warn("[TargetBridge] No scene element available, skipping target setup");
      return;
    }
    
    console.log("[TargetBridge] Scene available, setting up target listeners");
    
    // Wait a moment for the scene to fully initialize
    setTimeout(() => {
      console.log("[TargetBridge] Setting up target listeners");
      // Set up new target listeners and store the cleanup function
      this.cleanupListeners = setupTargetListeners();
    }, 300); // Give A-Frame and MindAR time to set up components
  }

  /**
   * Clean up target listeners
   */
  private cleanupTargetListeners(): void {
    if (this.cleanupListeners) {
      console.log("[TargetBridge] Cleaning up existing target listeners");
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
  }

  /**
   * Clean up all subscriptions and listeners
   */
  private cleanup(): void {
    this.cleanupTargetListeners();
    
    if (this.sceneChangeUnsubscribe) {
      this.sceneChangeUnsubscribe();
      this.sceneChangeUnsubscribe = null;
    }
    
    this.initialized = false;
  }
}

// Register the custom element
customElements.define("target-bridge", TargetBridge);