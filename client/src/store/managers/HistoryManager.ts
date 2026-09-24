import { SceneService } from '@/services/SceneService';
import {
  ConfigurationVersion,
  ErrorInfo,
  IGame,
  IHistoryManager,
  TargetHistoryEntry
} from '@/types';
import { getConfigVersion, getSpread, getTargets } from '@/utils/game-config';

/**
 * Manages user history and progress tracking
 */
export class HistoryManager implements IHistoryManager {
  private game: IGame;
  private readonly HISTORY_STORAGE_KEY = 'ar-game-target-history';
  private readonly CONFIG_VERSION_KEY = 'ar-game-config-version';
  private sceneService: SceneService;

  constructor(game: IGame) {
    this.game = game;
    this.sceneService = SceneService.getInstance();
    this.sceneService.onSceneReady(() => {
      console.log('[HistoryManager] Scene is ready, loading history');
      this.load();
    });
  }

  /**
   * Check if configuration has changed
   */
  private checkConfigurationVersion(): void {
    try {
      const storedVersion = localStorage.getItem(this.CONFIG_VERSION_KEY);
      const currentVersion = getConfigVersion();

      if (!storedVersion) {
        this.saveConfigurationVersion();
        return;
      }

      const storageVersion = JSON.parse(storedVersion) as ConfigurationVersion;

      if (storageVersion.version !== currentVersion.version) {
        console.warn(
          `Game configuration has changed from version ${storageVersion.version} to ${currentVersion.version}. ` +
            `Last update was on ${new Date(storageVersion.timestamp).toLocaleDateString()}. ` +
            `Some spread or target data might have changed.`,
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
      const versionData: ConfigurationVersion = getConfigVersion();
      localStorage.setItem(
        this.CONFIG_VERSION_KEY,
        JSON.stringify(versionData),
      );
    } catch (error) {
      console.warn('Failed to save configuration version:', error);
    }
  }

  /**
   * Load target history from local storage
   */
  public load(): void {
    // Check if configuration has changed
    this.checkConfigurationVersion();

    // Load history from localStorage
    this.loadTargetHistory();

    // If there are previous entries, notify the user they can resume
    if (this.game.state.history.length > 0) {
      // Get the most recent entry
      const lastEntry = [...this.game.state.history].sort(
        (a, b) => b.timestamp - a.timestamp,
      )[0];

      // Find spread in config
      const spreadConfig = getSpread(lastEntry.spreadId);
      const spreadName = spreadConfig?.title || lastEntry.spreadId;

      // Create a notification with resume action
      this.game.notifyError({
        msg: `You have a previous session in spread "${spreadName}".`,
        action: {
          text: 'Resume',
          callback: () => {
            // Resume the last spread using switchSpread
            this.game.spreads.switchSpread(lastEntry.spreadId);
            // The route sets scan mode
            this.game.router.navigate('/spread');
          },
        },
      } as ErrorInfo);
    }
  }

  /**
   * Mark a target as seen by the user
   */
  public markTargetAsSeen(spreadId: string, targetIndex: number): void {
    const existingEntry = this.game.state.history.find(
      (entry) =>
        entry.spreadId === spreadId && entry.targetIndex === targetIndex,
    );

    if (!existingEntry) {
      // Update history using game store update pattern
      this.game.update((draft) => {
        if (!draft.history) {
          draft.history = [];
        }

        draft.history.push({
          spreadId,
          targetIndex,
          timestamp: Date.now(),
        });

        // Update local reference to match store state
        this.game.update((draft) => {
          draft.history = draft.history;
        });
      });

      // Save updated history
      this.saveTargetHistory();
    }
  }

  /**
   * Check if a target has been seen before
   */
  public hasTargetBeenSeen(spreadId: string, targetIndex: number): boolean {
    return this.game.state.history.some(
      (entry) =>
        entry.spreadId === spreadId && entry.targetIndex === targetIndex,
    );
  }

  /**
   * Get all target indices that have been seen in a specific spread
   */
  public getSeenTargetsForSpread(spreadId: string): number[] {
    return this.game.state.history
      .filter((entry) => entry.spreadId === spreadId)
      .map((entry) => entry.targetIndex);
  }

  /**
   * Calculate the percentage of targets seen in a spread
   */
  public getSpreadCompletionPercentage(spreadId: string): number {
    const spread =
      this.game.state.spreads[spreadId] || getSpread(spreadId);

    if (!spread) return 0;

    const totalTargets = getTargets(spreadId).length || 0;
    if (totalTargets === 0) return 100; // No targets = 100% complete

    const seenTargets = this.getSeenTargetsForSpread(spreadId).length;
    return Math.round((seenTargets / totalTargets) * 100);
  }

  /**
   * Check if all targets in a spread have been seen
   */
  public isSpreadComplete(spreadId: string): boolean {
    return this.getSpreadCompletionPercentage(spreadId) === 100;
  }

  /**
   * Reset seen history for a specific spread
   */
  public resetSpreadHistory(spreadId: string): void {
    // Update history using game store update pattern
    this.game.update((draft) => {
      if (!draft.history) {
        draft.history = [];
        return;
      }

      draft.history = draft.history.filter(
        (entry: { spreadId: string }) => entry.spreadId !== spreadId,
      );

      // Update local reference to match store state
      this.game.update((draft) => {
        draft.history = draft.history;
      });
    });

    this.saveTargetHistory();
  }

  /**
   * Reset all target history
   */
  public reset(): void {
    this.game.update((draft) => {
      draft.history = [];
    });

    this.saveTargetHistory();
  }

  /**
   * Save target history to local storage
   */
  private saveTargetHistory(): void {
    try {
      localStorage.setItem(
        this.HISTORY_STORAGE_KEY,
        JSON.stringify(this.game.state.history),
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
        // Drop entries for spreads that no longer exist (e.g. pre-rename `chapterId` entries).
        // TODO Phase 2: replace with stable IDs + content-version migration.
        const entries = (JSON.parse(storedHistory) as TargetHistoryEntry[])
          .filter((entry) => getSpread(entry?.spreadId) !== undefined);
        this.game.update((draft) => {
          draft.history = entries;
        });
      }
    } catch (error) {
      console.warn('Failed to load target history from localStorage:', error);
    }
  }
}
