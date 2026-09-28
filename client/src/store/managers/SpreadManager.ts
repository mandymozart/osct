import { SpreadState, ISpreadManager, IGame, LoadingState } from '@/types';
import { getSpread, getSpreads, getInitialSpreadId } from '@/utils/game-config';

/**
 * Spread registry (`GameState.spreads`) and the active spread (`currentSpread`). Each spread
 * carries a loading status (INITIAL → LOADING → LOADED | ERROR). All spreads of the content
 * are registered at startup with the initial spread active.
 */
export class SpreadManager implements ISpreadManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
    this.initialize()
  }

  private initialize(): void {
    const spreadsData = getSpreads();
    const spreadsState: Record<string, SpreadState> = {};
    
    spreadsData.forEach(spread => {
      spreadsState[spread.id] = {
        id: spread.id,
        status: LoadingState.INITIAL
      };
    });
    this.game.update(draft => {
      draft.currentSpread = getInitialSpreadId();
      draft.spreads = spreadsState;
    });
  }

  public getCurrentSpread(): string | null {
    return this.game.state.currentSpread;
  }

  /** Make a spread active; ids unknown to the content are ignored */
  public switchSpread(id: string): void {
    const spreadData = getSpread(id);
    if (!spreadData) {
      console.error(`[SpreadManager] "${id}" not found in configuration`);
      return 
    }

    if (!this.game.state.spreads[id]) {
      this.register(id);
    }

    this.game.update(draft => {
      draft.currentSpread = id;
    });

    console.log(`[SpreadManager] Switched to "${id}"`);
    return
  }

  public register(id: string): void {
    if (this.game.state.spreads[id]) {
      console.warn(`[SpreadManager] "${id}" already registered, skipping`);
      return;
    }

    this.game.update(draft => {
      draft.spreads[id] = {
        id,
        status: LoadingState.INITIAL
      };
    });

    console.log(`[SpreadManager] Registered "${id}"`);
  }

  /** Only a spread in INITIAL moves to LOADING; unknown ids are registered first */
  public markLoading(id: string): void {
    if (!this.game.state.spreads[id]) {
      console.warn(`[SpreadManager] "${id}" not found, registering first`);
      this.register(id);
    }

    const spread = this.game.state.spreads[id];
    if (spread && spread.status !== LoadingState.INITIAL) {
      console.log(`[SpreadManager] "${id}" not in INITIAL state, skipping`);
      return;
    }

    this.game.update(draft => {
      if (draft.spreads[id]) {
        draft.spreads[id].status = LoadingState.LOADING;
      }
    });

    console.log(`[SpreadManager] "${id}" marked as loading`);
  }

  /** Unknown ids are created directly as LOADED */
  public markLoaded(id: string): void {
    if (!this.game.state.spreads[id]) {
      console.warn(`[SpreadManager] "${id}" not found, registering and marking as loaded`);

      this.game.update(draft => {
        draft.spreads[id] = {
          id,
          status: LoadingState.LOADED
        };
      });

      console.log(`[SpreadManager] "${id}" created and marked as loaded`);
      return;
    }

    this.game.update(draft => {
      if (draft.spreads[id]) {
        draft.spreads[id].status = LoadingState.LOADED;
      }
    });

    console.log(`[SpreadManager] "${id}" marked as loaded`);
  }

  /** Unknown ids are created directly as ERROR */
  public markFailed(id: string, error: Error): void {
    if (!this.game.state.spreads[id]) {
      console.warn(`[SpreadManager] "${id}" not found, registering and marking as failed`);

      this.game.update(draft => {
        draft.spreads[id] = {
          id,
          status: LoadingState.ERROR,
          error
        };
      });

      console.error(`[SpreadManager] "${id}" created and marked as failed:`, error);
      return;
    }

    this.game.update(draft => {
      if (draft.spreads[id]) {
        draft.spreads[id].status = LoadingState.ERROR;
        draft.spreads[id].error = error;
      }
    });

    console.error(`[SpreadManager] "${id}" marked as failed:`, error);
  }

  public isLoaded(id: string): boolean {
    const spread = this.game.state.spreads[id];
    return spread?.status === LoadingState.LOADED;
  }

  /** Number of loaded spreads out of all registered ones */
  public getLoadingStatus(): { loaded: number; total: number } {
    const spreads = Object.values(this.game.state.spreads);
    const loaded = spreads.filter(
      (spread) => spread.status === LoadingState.LOADED
    ).length;

    return {
      loaded,
      total: spreads.length
    };
  }
}