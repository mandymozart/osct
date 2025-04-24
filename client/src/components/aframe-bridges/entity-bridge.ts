import { GameStoreService } from '@/services/GameStoreService';
import { sceneService } from '@/services/SceneService';
import { ErrorCode, GameState, IGame, LoadingState } from '@/types';
import { EntityState } from '@/types/entities';
import { waitForDOMReady } from '@/utils';
import { Entity, Scene } from 'aframe';


class EntityBridge extends HTMLElement {
  private game: IGame;
  private entitiesEl: Entity[] = [];
  private initialized: boolean = false;
  private sceneCleanupCallback: (() => void) | null = null;
  private entitySubscriptionCleanup: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.game = GameStoreService.getInstance();
    this.sceneCleanupCallback = sceneService.onSceneReady(this.setupWithScene.bind(this));
    this.entitySubscriptionCleanup = this.game.subscribeToProperty(
      'entities',
      this.handleEntitiesStateChange.bind(this)
    );
    console.log('[EntityBridge] Setting up entities')
  }

  private setupWithScene(scene: Scene) {
    this.setup(scene);
  }

  protected async setup(scene: Scene) {
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

      this.entitiesEl = scene.querySelectorAll(
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

      this.game.entities.register(entityId, entityState);
    });
  }

  private handleEntitiesStateChange(entities: Record<string, EntityState>) {
    // Only process entities if we're initialized
    if (!this.initialized) return;
    
    // TODO: figure out what triggers the clear method for example. because entities need to be removed before new ones are added.
    if (entities) {
      // TODO: Do
    }
  }

  private createEntity(id: string) {
    const entityId = id;
    const scene = sceneService.getScene();
    
    if (scene) {
      // TODO: Implement entity creation
    }
  }

  private clear(): void {
    const scene = sceneService.getScene();
    if (!scene) return;
    
    const entities = scene.querySelectorAll(
      'a-entity',
    ) as unknown as Entity[];
    entities.forEach((target) => target.remove());
  }
  
  public disconnect() {
    if (this.sceneCleanupCallback) {
      this.sceneCleanupCallback();
      this.sceneCleanupCallback = null;
    }
    
    if (this.entitySubscriptionCleanup) {
      this.entitySubscriptionCleanup();
      this.entitySubscriptionCleanup = null;
    }
  }
}

customElements.define('entity-bridge', EntityBridge);