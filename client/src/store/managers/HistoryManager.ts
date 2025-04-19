import { produce } from 'immer';
import config from "./../../game.config.json";
import { ConfigurationVersion, IGame, TargetHistoryEntry as HistoryEntry, IHistoryManager } from '@/types';

/**
 * Manages user history and progress tracking
 */
export class HistoryManager implements IHistoryManager {
  private game: IGame;
  private history: HistoryEntry[] = [];
  private readonly HISTORY_STORAGE_KEY = 'ar-game-target-history';
  private readonly CONFIG_VERSION_KEY = 'ar-game-config-version';

  constructor(game: IGame) {
    this.game = game;
  }
  
  /**
   * Check if configuration has changed
   */
  private checkConfigurationVersion(): void {
    try {
      const storedVersion = localStorage.getItem(this.CONFIG_VERSION_KEY);
      const currentVersion = config;
      
      if (!storedVersion) {
        this.saveConfigurationVersion();
        return;
      }

      const storageVersion = JSON.parse(storedVersion) as ConfigurationVersion;
      
      if (storageVersion.version !== currentVersion.version) {
        console.warn(
          `Game configuration has changed from version ${storageVersion.version} to ${currentVersion.version}. ` +
          `Last update was on ${new Date(storageVersion.timestamp).toLocaleDateString()}. ` +
          `Some chapter or target data might have changed.`
        );
      }

      this.saveConfigurationVersion();
    } catch (error) {
      console.warn('Failed to check configuration version:', error);
    }
  }

  /**
   * Save current configuration version
   */
  private saveConfigurationVersion(): void {
    try {
      const versionData: ConfigurationVersion = config.version as unknown as ConfigurationVersion;
      localStorage.setItem(this.CONFIG_VERSION_KEY, JSON.stringify(versionData));
    } catch (error) {
      console.warn('Failed to save configuration version:', error);
    }
  }

  /**
   * Load target history from local storage
   */
  public load(): void {
    this.checkConfigurationVersion();
    this.loadTargetHistory();
  }

  /**
   * Mark a target as seen by the user
   */
  public markTargetAsSeen(chapterId: string, targetIndex: number): void {
    const existingEntry = this.history.find(
      entry => entry.chapterId === chapterId && entry.targetIndex === targetIndex
    );
    
    if (!existingEntry) {
      // Use Immer to update history
      this.history = produce(this.history, draft => {
        draft.push({
          chapterId,
          targetIndex,
          timestamp: Date.now()
        });
      });
      
      // Save updated history
      this.saveTargetHistory();
      
      // Notify listeners of change
      this.game.notifyListeners();
    }
  }

  /**
   * Check if a target has been seen before
   */
  public hasTargetBeenSeen(chapterId: string, targetIndex: number): boolean {
    return this.history.some(
      entry => entry.chapterId === chapterId && entry.targetIndex === targetIndex
    );
  }

  /**
   * Get all target indices that have been seen in a specific chapter
   */
  public getSeenTargetsForChapter(chapterId: string): number[] {
    return this.history
      .filter(entry => entry.chapterId === chapterId)
      .map(entry => entry.targetIndex);
  }

  /**
   * Calculate the percentage of targets seen in a chapter
   */
  public getChapterCompletionPercentage(chapterId: string): number {
    const chapter = this.game.state.chapters[chapterId] || 
                   config.chapters.find(ch => ch.id === chapterId);
    
    if (!chapter) return 0;
    
    const totalTargets = chapter.targets?.length || 0;
    if (totalTargets === 0) return 100; // No targets = 100% complete
    
    const seenTargets = this.getSeenTargetsForChapter(chapterId).length;
    return Math.round((seenTargets / totalTargets) * 100);
  }

  /**
   * Check if all targets in a chapter have been seen
   */
  public isChapterComplete(chapterId: string): boolean {
    return this.getChapterCompletionPercentage(chapterId) === 100;
  }

  /**
   * Reset seen history for a specific chapter
   */
  public resetChapterHistory(chapterId: string): void {
    // Use Immer to filter out entries for the specified chapter
    this.history = produce(this.history, draft => {
      return draft.filter(entry => entry.chapterId !== chapterId);
    });
    
    this.saveTargetHistory();
    this.game.notifyListeners();
  }

  /**
   * Reset all target history
   */
  public reset(): void {
    this.history = [];
    this.saveTargetHistory();
    this.game.notifyListeners();
  }

  /**
   * Save target history to local storage
   */
  private saveTargetHistory(): void {
    try {
      localStorage.setItem(
        this.HISTORY_STORAGE_KEY, 
        JSON.stringify(this.history)
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
        this.history = JSON.parse(storedHistory);
      }
    } catch (error) {
      console.warn('Failed to load target history from localStorage:', error);
    }
  }
}
