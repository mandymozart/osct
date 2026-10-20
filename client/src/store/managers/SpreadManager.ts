import { ISpreadManager, IGame } from '@/types';
import { getSpread, getInitialSpreadId } from '@/utils/game-config';

/**
 * The active spread (`currentSpread`): the content's initial spread at startup, then whichever spread the
 * reader switches to (spread menu, links, automatic switch while scanning, the restored last spread).
 */
export class SpreadManager implements ISpreadManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
    this.game.update(draft => {
      draft.currentSpread = getInitialSpreadId();
    });
  }

  public getCurrentSpread(): string | null {
    return this.game.state.currentSpread;
  }

  /** Make a spread active; ids unknown to the content are ignored */
  public switchSpread(id: string): void {
    if (!getSpread(id)) {
      console.error(`[SpreadManager] "${id}" not found in configuration`);
      return;
    }

    this.game.update(draft => {
      draft.currentSpread = id;
    });

    console.log(`[SpreadManager] Switched to "${id}"`);
  }
}
