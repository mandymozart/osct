import { LoadingState } from '@/types/common';
import { EntityState, IEntityManager } from '@/types/entities';
import { IGame } from '@/types/game';

/**
 * Manages A-Frame entities through game state
 */
export class EntityManager implements IEntityManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Register an entity for loading
   * @param id Unique identifier for the entity
   */
  public register(id: string, state: EntityState): void {
    if (this.game.state.entities[id]) {
      console.warn(`[EntityManager] Entity ${id} already registered, skipping`);
      return;
    }
    
    this.game.update(draft => {
      draft.entities[id] = {
        id,
        status: LoadingState.INITIAL
      };
    });
  }

  public remove(id: string): void {
    const entity = this.game.state.entities[id];
    if (!entity) {
      console.warn(`[EntityManager] Entity ${id} not found, cannot remove`);
      return;
    }
    
    this.game.update(draft => {
      delete draft.entities[id];
    });
    
    console.log(`[EntityManager] Entity ${id} removed`);
  }

  /**
   * Mark an entity as loaded
   * @param id Entity identifier
   */
  public markLoaded(id: string): void {
    const entity = this.game.state.entities[id];
    if (!entity) {
      console.warn(`[EntityManager] Cannot mark unknown entity ${id} as loaded`);
      return;
    }

    if (entity.status === LoadingState.LOADED) return;

    this.game.update(draft => {
      draft.entities[id].status = LoadingState.LOADED;
    });
  }

  /**
   * Mark an entity as failed
   * @param id Entity identifier
   * @param error Error that occurred
   */
  public markFailed(id: string, error: Error): void {
    const entity = this.game.state.entities[id];
    if (!entity) {
      console.warn(`[EntityManager] Cannot mark unknown entity ${id} as failed`);
      return;
    }

    this.game.update(draft => {
      draft.entities[id].status = LoadingState.ERROR;
      draft.entities[id].error = error;
    });

    console.error(`[EntityManager] Entity ${id} failed to load:`, error);
  }

  /**
   * Check if all entities for current chapter are loaded
   * @returns True if all chapter entities are loaded
   */
  public areAllEntitiesLoaded(): boolean {
    if (Object.keys(this.game.state.entities).length === 0) {
      return true; // No entities to load
    }

    return Object.values(this.game.state.entities).every(entity => entity.status === LoadingState.LOADED);
  }

  /**
   * Get loading status for all entities
   * @returns Status statistics
   */
  public getLoadingStatus(): { loaded: number; total: number } {
    const entities = Object.values(this.game.state.entities);
    const loaded = entities.filter(entity => entity.status === LoadingState.LOADED).length;
    return {
      loaded,
      total: entities.length
    };
  }
}
