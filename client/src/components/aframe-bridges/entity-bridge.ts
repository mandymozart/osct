import { GameStoreService } from '@/services/GameStoreService';
import { ErrorCode, GameState, IGame, LoadingState } from '@/types';
import { EntityState } from '@/types/entities';
import { waitForDOMReady } from '@/utils';
import { Entity } from 'aframe';

interface IEntityBridge {}

class EntityBridge implements IEntityBridge {
  private game: IGame;
  private entitiesEl: Entity[] = [];
  private initialized: boolean = false;

  constructor() {
    this.game = GameStoreService.getInstance();
    this.setup();
  }

  protected async setup() {
    // Prevent multiple initialization attempts
    if (this.initialized) {
      console.log(
        '[EntityBridge] Entities setup already in progress or completed',
      );
      return;
    }
    this.initialized = true;

    try {
      await waitForDOMReady();

      this.entitiesEl = this.game.state.scene?.querySelectorAll(
        'a-entity',
      ) as unknown as Entity[];

      if (!this.entitiesEl) {
        console.error('[EntityBridge] No entities found');
        this.initialized = false; // Reset so we can try again
        return;
      }
    } catch (error) {
      this.game.notifyError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        msg: 'No entities were found.',
      });
      this.initialized = false; // Reset so we can try again
    }

    this.entitiesEl.forEach((entityEl) => {
      const entityId = entityEl.getAttribute('id');
      if (!entityId) {
        console.warn('[EntityBridge] Found entity without ID', entityEl);
        return;
      }

      const entityState: EntityState = {
        status: LoadingState.INITIAL,
      };

      this.game.entities.registerEntity(entityId, entityState);
    });
  }

  protected setupListeners() {
    this.game.subscribe(this.handleStateChange.bind(this));
  }

  private handleStateChange(state: GameState) {
    if (state.entities) {
      this.handleEntitiesStateChange(state.entities);
    }
  }
  private handleEntitiesStateChange(entities: Record<string, EntityState>) {
    console.log(entities);
    // TODO: figure out what triggers the clear method for example. because entities need to be removed before new ones are added.
    if (entities) {
      // TODO: Do
    }
  }

  private createEntity(id: string) {
    const entityId = `${this.game.state.currentChapter?.id}-entity_${id}`;

    this.game.state.scene?.appendChild;
  }

  private clear(): void {
    const entities = this.game.state.scene?.querySelectorAll(
      'a-entity',
    ) as unknown as Entity[];
    entities.forEach((target) => target.remove());
  }
}
