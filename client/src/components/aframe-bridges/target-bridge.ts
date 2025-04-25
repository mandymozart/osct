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
  private game: Readonly<IGame>;
  private sceneService: ISceneService;
  private currentChapter: string | null = null;
  private cleanupListeners: (() => void) | null = null;
  
  private initialized = false;
  private chapterUnsubscribe: (() => void) | null = null;
  private sceneUnsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
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
   * Set up subscriptions to game state and scene changes
   */
  private setupSubscriptions(): void {
    // Subscribe to chapter changes
    this.chapterUnsubscribe = this.game.subscribeToProperty("currentChapter", 
      this.handleChapterChange.bind(this));
    
    // Subscribe to scene changes from SceneService
    this.sceneUnsubscribe = this.sceneService.onSceneReady(
      this.handleSceneReady.bind(this));
  }

  /**
   * Handle chapter changes by potentially setting up new target listeners
   */
  private handleChapterChange(chapterId: string | null): void {
    if (chapterId && chapterId !== this.currentChapter) {
      console.log(`[TargetBridge] Chapter changed to: ${chapterId}`);
      this.currentChapter = chapterId;
      
      // The scene will be updated separately, and handleSceneReady will be called
    }
  }

  /**
   * Handle scene ready event
   */
  private handleSceneReady(scene: HTMLElement): void {
    console.log(`[TargetBridge] Scene ready, connecting targets`);
    this.connectToCurrentScene();
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
    
    // Wait a moment for the scene to fully initialize
    setTimeout(() => {
      console.log("[TargetBridge] Setting up target listeners");
      // Set up new target listeners and store the cleanup function
      this.cleanupListeners = setupTargetListeners(this.game, sceneElement);
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
    
    if (this.chapterUnsubscribe) {
      this.chapterUnsubscribe();
      this.chapterUnsubscribe = null;
    }
    
    if (this.sceneUnsubscribe) {
      this.sceneUnsubscribe();
      this.sceneUnsubscribe = null;
    }
    
    this.initialized = false;
  }
}

// Register the custom element
customElements.define("target-bridge", TargetBridge);
