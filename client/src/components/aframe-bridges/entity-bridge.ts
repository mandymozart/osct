import { GameStoreService } from '@/services/GameStoreService';
import { sceneService } from '@/services/SceneService';
import { ErrorCode, IGame, LoadingState } from '@/types';
import { EntityState } from '@/types/entities';
import { waitForDOMReady } from '@/utils';
import { getTarget } from '@/utils/config';
import { Entity, Scene } from 'aframe';
import { createEntity } from './utils/targetEntities';

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
        '[mindar-image-target]',
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
      const isMindArImageTarget = entityEl.getAttribute('mindar-image-target') !== null;
      if(!isMindArImageTarget){
        console.warn('[EntityBridge] Not an MindAr Image Target', entityEl);
        return;
      }
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
    
    // TODO: implement state changes on properties and add event handlers based on configuration,links, etc.

    if (entities) {
      // this.clear();
      // TODO: Update state on entites rather than removing them. 
      // Object.entries(entities).forEach(([entityId, entityState]) => {
      //   this.create(entityId, entityState);
      // });
    }
  }

  private create(id: string, entityState: EntityState) {
    // TODO: Deactivate for now, I reload the entire scene instead of manually updating. 
    return;
    // const entityId = id;
    // const scene = sceneService.getScene();
    // const target = getTarget(entityId);
    // if(!target) {
    //   console.error(`[EntityBridge] Could not find target for entity: ${entityId}`);
    //   return;
    // }
    // console.log('[EntityBridge] Creating entity for target:', target.entity.type);

    // if (scene && target && target.entity) {
    //   try {
    //     const entity = createEntity(target);
    //     scene.appendChild(entity);
    //     console.log(`[EntityBridge] Created entity for target: ${entityId}, type: ${target.entity.type}`);
    //   } catch (error) {
    //     console.error(`[EntityBridge] Error creating entity for target: ${entityId}`, error);
    //   }
    // } else {
    //   console.warn(`[EntityBridge] Could not create entity for target: ${entityId} - missing configuration`);
    // }
  }

  // private clear(): void {
  //   const scene = sceneService.getScene();
  //   if (!scene) return;
    
  //   const entities = scene.querySelectorAll(
  //     '[mindar-image-target]',
  //   ) as unknown as Entity[];
  //   entities.forEach((target) => {
  //     console.log(target.nodeType)
  //     target.remove()
  // });
  // }
  
  public disconnect() {
    if (this.sceneCleanupCallback) {
      this.sceneCleanupCallback();
      this.sceneCleanupCallback = null;
    }
    
    if (this.entitySubscriptionCleanup) {
      this.entitySubscriptionCleanup();
      this.entitySubscriptionCleanup = null;    }
  }
}

customElements.define('entity-bridge', EntityBridge);