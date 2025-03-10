import { produce } from 'immer';
import { chapters } from "../../data/chapters.js";
import { TargetHistoryEntry } from "../types.js";

/**
 * Manages user history and progress tracking
 */
export class HistoryManager {
  private store: any; // Reference to the main store
  private targetHistory: TargetHistoryEntry[] = [];
  private readonly HISTORY_STORAGE_KEY = 'ar-game-target-history';
  
  constructor(store: any) {
    this.store = store;
  }
  
  /**
   * Load target history from local storage
   */
  loadHistory(): void {
    this.loadTargetHistory();
  }

  /**
   * Mark a target as seen by the user
   */
  markTargetAsSeen(chapterId: string, targetIndex: number): void {
    const existingEntry = this.targetHistory.find(
      entry => entry.chapterId === chapterId && entry.targetIndex === targetIndex
    );
    
    if (!existingEntry) {
      // Use Immer to update history
      this.targetHistory = produce(this.targetHistory, draft => {
        draft.push({
          chapterId,
          targetIndex,
          timestamp: Date.now()
        });
      });
      
      // Save updated history
      this.saveTargetHistory();
      
      // Notify listeners of change
      this.store.notifyListeners();
    }
  }

  /**
   * Check if a target has been seen before
   */
  hasTargetBeenSeen(chapterId: string, targetIndex: number): boolean {
    return this.targetHistory.some(
      entry => entry.chapterId === chapterId && entry.targetIndex === targetIndex
    );
  }

  /**
   * Get all target indices that have been seen in a specific chapter
   */
  getSeenTargetsForChapter(chapterId: string): number[] {
    return this.targetHistory
      .filter(entry => entry.chapterId === chapterId)
      .map(entry => entry.targetIndex);
  }

  /**
   * Calculate the percentage of targets seen in a chapter
   */
  getChapterCompletionPercentage(chapterId: string): number {
    const chapter = this.store.state.cachedChapters[chapterId] || 
                   chapters.find(ch => ch.id === chapterId);
    
    if (!chapter) return 0;
    
    const totalTargets = chapter.targets?.length || 0;
    if (totalTargets === 0) return 100; // No targets = 100% complete
    
    const seenTargets = this.getSeenTargetsForChapter(chapterId).length;
    return Math.round((seenTargets / totalTargets) * 100);
  }

  /**
   * Check if all targets in a chapter have been seen
   */
  isChapterComplete(chapterId: string): boolean {
    return this.getChapterCompletionPercentage(chapterId) === 100;
  }

  /**
   * Reset seen history for a specific chapter
   */
  resetChapterHistory(chapterId: string): void {
    // Use Immer to filter out entries for the specified chapter
    this.targetHistory = produce(this.targetHistory, draft => {
      return draft.filter(entry => entry.chapterId !== chapterId);
    });
    
    this.saveTargetHistory();
    this.store.notifyListeners();
  }

  /**
   * Reset all target history
   */
  resetAllHistory(): void {
    this.targetHistory = [];
    this.saveTargetHistory();
    this.store.notifyListeners();
  }

  /**
   * Save target history to local storage
   */
  private saveTargetHistory(): void {
    try {
      localStorage.setItem(
        this.HISTORY_STORAGE_KEY, 
        JSON.stringify(this.targetHistory)
      );
    } catch (error) {
      console.warn('Failed to save target history to localStorage:', error);
    }
  }

  /**
   * Load target history from local storage
   */
  private loadTargetHistory(): void {
    try {
      const storedHistory = localStorage.getItem(this.HISTORY_STORAGE_KEY);
      if (storedHistory) {
        this.targetHistory = JSON.parse(storedHistory);
      }
    } catch (error) {
      console.warn('Failed to load target history from localStorage:', error);
    }
  }
}
