import { LoadableStore } from './LoadableStore';
import { ChapterManager } from './managers/ChapterManager';
import { HistoryManager } from './managers/HistoryManager';
import { TargetTracker } from './managers/TargetTracker';
import { Chapter, GameState, Target } from './types';

/**
 * Game-specific store that manages chapter loading and target tracking
 * Uses specialized managers for different concerns
 */
export class GameStore extends LoadableStore {
  state: GameState;
  
  // Specialized managers
  private chapterManager: ChapterManager;
  private targetTracker: TargetTracker;
  private historyManager: HistoryManager;
  
  constructor() {
    super();
    
    // Initialize with game-specific state
    this.state = {
      scene: null,
      trackedTargets: [],
      currentChapter: null,
      cachedChapters: {},
    };
    
    // Initialize specialized managers
    this.chapterManager = new ChapterManager(this);
    this.targetTracker = new TargetTracker(this);
    this.historyManager = new HistoryManager(this);
    
    this.initialize();
  }

  /**
   * Initialize the game store
   */
  private initialize(): void {
    console.log("GameStore initialized");
    this.historyManager.loadHistory();
  }

  /**
   * Get the A-Frame scene
   */
  getScene(): any {
    return this.state.scene;
  }

  /**
   * Set the A-Frame scene
   */
  setScene(scene: any): void {
    this.set({ scene });
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
}

export const gameStore = new GameStore();