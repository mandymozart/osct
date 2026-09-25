import { LocalProgressStorage } from '@/services/ProgressStorage';
import {
  EntryCategory,
  ErrorInfo,
  IGame,
  IHistoryManager,
  IProgressStorage,
  ProgressRecord,
} from '@/types';
import { getBook, getEntry, getSpread, getTarget, getTargets } from '@/utils/game-config';
import { ProgressReadStatus, createProgressRecord, readProgress } from '@/utils';

/**
 * Progress of the reader in this book (PLAN Phase 2): unlocked targets, consulted entries,
 * last spread / category, onboarding – one record per book, keyed by stable ids.
 * Loaded at startup; every change is saved through the storage adapter.
 */
export class HistoryManager implements IHistoryManager {
  private game: IGame;
  private storage: IProgressStorage;
  /** How the last load went – told to the user once, together with the resume offer */
  private loadStatus: ProgressReadStatus | null = null;

  constructor(game: IGame, storage: IProgressStorage = new LocalProgressStorage()) {
    this.game = game;
    this.storage = storage;
    this.load();
    this.game.subscribeToProperty('currentSpread', (spreadId) => {
      if (spreadId && spreadId !== this.progress.lastSpreadId) {
        this.change(draft => { draft.lastSpreadId = spreadId; });
      }
    });
  }

  private get progress(): ProgressRecord {
    return this.game.state.progress;
  }

  /**
   * Load the progress record: current format as is, an older format converted and saved in the
   * current one.
   */
  public load(): void {
    const bookId = getBook().id;
    const { record, status } = readProgress(this.storage.load(bookId), bookId);
    if (status === 'unreadable') {
      console.warn('[HistoryManager] Stored progress could not be read, starting fresh.');
    }

    const appVersion = __VITE_APP_VERSION__;
    const versionChanged = record.appVersions[record.appVersions.length - 1] !== appVersion;
    if (versionChanged) record.appVersions.push(appVersion);

    this.game.update(draft => {
      draft.progress = record;
    });
    if (status !== 'current' || versionChanged) this.storage.save(this.progress);

    this.loadStatus = status;
  }

  /**
   * Offer to resume the last spread. One notice at a time (`currentError`), so a format
   * conversion is told in the same notice.
   */
  public offerResume(): void {
    const status = this.loadStatus;
    this.loadStatus = null;

    const notes: string[] = [];
    if (status === 'converted') notes.push('Your progress was updated to the new app format.');
    if (status === 'unreadable') notes.push('Your saved progress could not be read and starts fresh.');

    const lastSpread = this.progress.lastSpreadId ? getSpread(this.progress.lastSpreadId) : undefined;
    if (lastSpread) notes.push(`You have a previous session in spread "${lastSpread.title || lastSpread.id}".`);
    if (notes.length === 0) return;

    this.game.notifyError({
      msg: notes.join(' '),
      type: 'info',
      ...(lastSpread
        ? {
            action: {
              text: 'Resume',
              callback: () => {
                this.game.spreads.switchSpread(lastSpread.id);
                // The route sets scan mode
                this.game.router.navigate('/spread');
              },
            },
          }
        : {}),
    } as ErrorInfo);
  }

  /** Also records the target's spread as the last spread (the initial spread never "changes") */
  public unlockTarget(targetId: string): void {
    if (this.isUnlocked(targetId)) return;
    const spreadId = getTarget(targetId)?.spreadId;
    this.change(draft => {
      draft.unlocked[targetId] = Date.now();
      if (spreadId) draft.lastSpreadId = spreadId;
    });
  }

  public isUnlocked(targetId: string): boolean {
    return targetId in this.progress.unlocked;
  }

  public getUnlockedTargets(spreadId: string): string[] {
    return getTargets(spreadId).filter(t => this.isUnlocked(t.id)).map(t => t.id);
  }

  public consultEntry(entryId: string): void {
    if (this.isConsulted(entryId)) return;
    this.change(draft => { draft.consulted[entryId] = Date.now(); });
  }

  public isConsulted(entryId: string): boolean {
    return entryId in this.progress.consulted;
  }

  public getConsultedCount(): number {
    return Object.keys(this.progress.consulted).filter(id => getEntry(id)).length;
  }

  public setLastCategory(category: EntryCategory): void {
    if (this.progress.lastCategory === category) return;
    this.change(draft => { draft.lastCategory = category; });
  }

  public setOnboarded(): void {
    if (this.progress.onboarded) return;
    this.change(draft => { draft.onboarded = true; });
  }

  public getMissingIds(): { targets: string[]; entries: string[] } {
    const { unlocked, consulted } = this.progress;
    return {
      targets: Object.keys(unlocked).filter(id => !getTarget(id)),
      entries: Object.keys(consulted).filter(id => !getEntry(id)),
    };
  }

  /**
   * Percentage of unlocked targets in a spread
   */
  public getSpreadCompletionPercentage(spreadId: string): number {
    if (!getSpread(spreadId)) return 0;
    const totalTargets = getTargets(spreadId).length;
    if (totalTargets === 0) return 100; // No targets = 100% complete
    return Math.round((this.getUnlockedTargets(spreadId).length / totalTargets) * 100);
  }

  public isSpreadComplete(spreadId: string): boolean {
    return this.getSpreadCompletionPercentage(spreadId) === 100;
  }

  /**
   * Reset the whole progress of this book (keeps the app version history)
   */
  public reset(): void {
    const { bookId, appVersions } = this.progress;
    this.game.update(draft => {
      draft.progress = { ...createProgressRecord(bookId), appVersions: [...appVersions] };
    });
    this.storage.save(this.progress);
  }

  /** Change the record in the store and save it */
  private change(recipe: (draft: ProgressRecord) => void): void {
    this.game.update(draft => recipe(draft.progress));
    this.storage.save(this.progress);
  }
}
