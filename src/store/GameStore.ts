import { Scene } from "aframe";
import { LoadableStore } from "./LoadableStore";
import { ChapterManager } from "./managers/ChapterManager";
import { HistoryManager } from "./managers/HistoryManager";
import { SceneManager } from "./managers/SceneManager";
import { TargetTracker } from "./managers/TargetTracker";
import {
  Chapter,
  ChapterData,
  ErrorInfo,
  GameConfiguration,
  GameMode,
  GameState,
  GameStore,
  Route,
  Target,
} from "./types";
import { QRManager } from "./managers/QRManager";
import { PageRouter } from "./managers/PageRouter";

/**
 * Game-specific store that manages chapter loading and target tracking
 * Uses specialized managers for different concerns
 */
export class Game extends LoadableStore implements GameStore {
  state: GameState;
  public configuration: GameConfiguration;

  // Specialized managers
  private sceneManager: SceneManager;
  private chapterManager: ChapterManager;
  private targetTracker: TargetTracker;
  private historyManager: HistoryManager;
  private pageRouter: PageRouter;
  private qrManager: QRManager;


  constructor() {
    super();

    this.configuration = {
      version: null,
      chapters: [],
      router: null
    };

    this.state = {
      // TODO: evaluate getScene vs. direct calling of mode
      scene: null,
      mode: GameMode.DEFAULT,
      currentRoute: null,
      trackedTargets: [],
      currentChapter: null,
      cachedChapters: {},
    };

    this.chapterManager = new ChapterManager(this);
    this.targetTracker = new TargetTracker(this);
    this.historyManager = new HistoryManager(this);
    this.sceneManager = new SceneManager(this);
    this.pageRouter = new PageRouter(this);
    this.qrManager = new QRManager(this);
    
  }

  /**
   * Initialize the game store
   */
  public initialize(configuration: GameConfiguration): void {
    this.configuration = Object.freeze({
      version: Object.freeze(configuration.version),
      chapters: Object.freeze([...configuration.chapters]),
      router: configuration.router
    });
    console.log(
      "GameStore initialized with configuration:",
      this.configuration
    );
    this.historyManager.loadHistory();
  }

  /**
   * Get available chapters data
   */
  getChaptersData(): ReadonlyArray<ChapterData> {
    return this.configuration.chapters;
  }

  /**
   * Attach the A-Frame scene to the store
   */
  public async attachScene(sceneSelector: Scene | string): Promise<void> {
    return this.sceneManager.attachScene(sceneSelector);
  }

  /**
   * Get the A-Frame scene
   */
  getScene(): Scene | null {
    return this.sceneManager.getScene();
  }

  /**
   * Check if scene is ready for AR
   */
  isSceneReady(): boolean {
    return this.sceneManager.isSceneReady();
  }

  /**
   * Enter VR mode
   */
  async enterVR(): Promise<void> {
    return this.sceneManager.enterVR();
  }

  /**
   * Exit VR mode
   */
  async exitVR(): Promise<void> {
    return this.sceneManager.exitVR();
  }

  /**
   * Start QR scanning mode
   */
  public startQRScanning(): void {
    this.qrManager.startScanning();
  }

  /**
   * Stop QR scanning mode
   */
  public stopQRScanning(): void {
    this.qrManager.stopScanning();
  }

  /**
   * Add a target index to the list of tracked targets and mark as seen
   */
  addTarget(targetIndex: number): void {
    this.targetTracker.addTarget(targetIndex);
  }

  /**
   * Remove a target from the list of tracked targets
   */
  removeTarget(targetIndex: number): void {
    this.targetTracker.removeTarget(targetIndex);
  }

  /**
   * Get the list of currently tracked target indices
   */
  getTrackedTargets(): number[] {
    return this.targetTracker.getTrackedTargets();
  }

  /**
   * Get targets from current chapter that are currently tracked
   */
  getTrackedTargetObjects(): Target[] {
    return this.targetTracker.getTrackedTargetObjects();
  }

  /**
   * Switch to a different chapter
   */
  switchChapter(chapterId: string): void {
    this.chapterManager.switchChapter(chapterId);
  }

  /**
   * Get a cached chapter if available
   */
  getCachedChapter(chapterId: string): Chapter | null {
    return this.chapterManager.getCachedChapter(chapterId);
  }

  /**
   * Mark a target as seen by the user
   */
  markTargetAsSeen(chapterId: string, targetIndex: number): void {
    this.historyManager.markTargetAsSeen(chapterId, targetIndex);
  }

  /**
   * Check if a target has been seen before
   */
  hasTargetBeenSeen(chapterId: string, targetIndex: number): boolean {
    return this.historyManager.hasTargetBeenSeen(chapterId, targetIndex);
  }

  /**
   * Get all target indices that have been seen in a specific chapter
   */
  getSeenTargetsForChapter(chapterId: string): number[] {
    return this.historyManager.getSeenTargetsForChapter(chapterId);
  }

  /**
   * Calculate the percentage of targets seen in a chapter
   */
  getChapterCompletionPercentage(chapterId: string): number {
    return this.historyManager.getChapterCompletionPercentage(chapterId);
  }

  /**
   * Check if all targets in a chapter have been seen
   */
  isChapterComplete(chapterId: string): boolean {
    return this.historyManager.isChapterComplete(chapterId);
  }

  /**
   * Reset seen history for a specific chapter
   */
  resetChapterHistory(chapterId: string): void {
    this.historyManager.resetChapterHistory(chapterId);
  }

  /**
   * Reset all target history
   */
  resetAllHistory(): void {
    this.historyManager.resetAllHistory();
  }

  /**
   * Navigate to page overlay 
   */
  navigate(route: Route): void {
    this.pageRouter.navigate(route)
  }

  showError(error: ErrorInfo): void {
    this.pageRouter.showError(error)
  }

  /**
   * Close page overlay
   */
  closePage(): void {
    this.pageRouter.close();
  }
}

export const createGameStore = () => new Game();
