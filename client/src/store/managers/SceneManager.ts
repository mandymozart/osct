import type { ISceneManager, IGame } from '@/types';
import { getScene, getInitialSceneId } from '@/utils/game-config';

/**
 * The active scene (`currentScene`): the content's initial scene at startup, then whichever scene the
 * reader switches to (scene menu, links, automatic switch while scanning, the restored last scene).
 */
export class SceneManager implements ISceneManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
    this.game.update(draft => {
      draft.currentScene = getInitialSceneId();
    });
  }

  /** Make a scene active; ids unknown to the content are ignored */
  public switchScene(id: string): void {
    if (!getScene(id)) {
      console.error(`[SceneManager] "${id}" not found in configuration`);
      return;
    }

    this.game.update(draft => {
      draft.currentScene = id;
    });

    console.log(`[SceneManager] Switched to "${id}"`);
  }
}
