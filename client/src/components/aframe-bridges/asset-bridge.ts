import { GameStoreService } from '@/services/GameStoreService';
import { sceneService } from '@/services/SceneService';
import { AssetData, IGame, LoadingState } from '@/types';
import { AssetState } from '@/types/assets';
import { getAsset } from '@/utils/config';
import { Entity, Scene } from 'aframe';

class AssetBridge extends HTMLElement {
  private game: IGame;
  private assetsEl: Entity | null = null;
  private processedAssets: Set<string> = new Set();
  private initialized: boolean = false;
  private initializing: boolean = false;
  private sceneCleanupCallback: (() => void) | null = null;
  private assetSubscriptionCleanup: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.game = GameStoreService.getInstance();
    this.assetSubscriptionCleanup = this.game.subscribeToProperty(
      'assets',
      this.handleAssetsStateChange.bind(this)
    );
    this.sceneCleanupCallback = sceneService.onSceneReady(this.setupScene.bind(this));
  }

  disconnectedCallback() {
    if (this.sceneCleanupCallback) {
      this.sceneCleanupCallback();
      this.sceneCleanupCallback = null;
    }
    if (this.assetSubscriptionCleanup) {
      this.assetSubscriptionCleanup();
      this.assetSubscriptionCleanup = null;
    }
  }

  /**
   * Set up event listeners for the A-Frame scene
   * @param scene The A-Frame scene element
   */
  private setupScene(scene: Scene): void {
    this.assetsEl = scene.querySelector('a-assets');
    if (!this.assetsEl) {
      console.warn('[AssetBridge] No a-assets element found in scene');
      
      scene.addEventListener('child-attached', ((event: Event) => {
        const detail = (event as any).detail;
        if (detail && detail.el && detail.el.tagName.toLowerCase() === 'a-assets') {
          this.assetsEl = detail.el as Entity;
          if (!this.initialized && !this.initializing) {
            this.registerExistingAssets();
          }
        }
      }) as EventListener);
    } else {
      if (!this.initialized && !this.initializing) {
        this.registerExistingAssets();
      }
    }
    
    scene.addEventListener('loaded', (() => {
      if (this.assetsEl && !this.initialized && !this.initializing) {
        this.registerExistingAssets();
      }
    }) as EventListener);
  }

  /**
   * Register any existing assets already in the A-Frame scene
   */
  private registerExistingAssets(): void {
    if (!this.assetsEl) return;
    if (this.initializing || this.initialized) return;
    
    this.initializing = true;
    
    const assetElements = this.assetsEl.querySelectorAll(
      'img, audio, video, a-asset-item',
    );

    assetElements.forEach((element) => {
      const id = element.id;
      if (!id) {
        console.warn(
          '[AssetBridge] Found asset element without ID, skipping:',
          element,
        );
        return;
      }

      if (this.processedAssets.has(id)) return

      const assetState: AssetState = {
        status: LoadingState.LOADING,
      };
      this.game.assets.register(id, assetState);
      this.processedAssets.add(id);
      this.setupAssetEventHandlers(element, id);
    });

    this.initialized = true;
    this.initializing = false;
  }

  /**
   * Process asset state changes and create DOM elements as needed
   * @param assets Current asset state from game state
   */
  private handleAssetsStateChange(assets: Record<string, AssetState>): void {
    if (!this.initialized || this.initializing) return;
    
    Object.entries(assets).forEach(([id, state]) => {
      if (this.processedAssets.has(id)) return;
      if(state.status === LoadingState.INITIAL) {
        this.createAssetElement(id);
      }
      this.processedAssets.add(id);
    });
  }

  /**
   * Create an asset element in the DOM
   * @param id Asset ID
   */
  private createAssetElement(id: string): void {
    // TODO: Deactivate for now, I reload the entire scene instead of manually updating. 
    return;
    // if (!this.assetsEl) return;
    // const asset: AssetData | undefined = getAsset(id);
    // if (!asset) {
    //   console.error(`Asset ${id} not found in configuration`);
    //   return;
    // }

    // const scene = sceneService.getScene();
    // const existingEl = scene?.querySelector(`#${id}`);
    // if (existingEl) return

    // if (asset.assetType === 'link') {
    //   this.game.assets.markLoaded(id);
    //   return;
    // }
    // if (!asset.src) {
    //   console.error(`Asset "${id}" of type ${asset.assetType} requires src attribute`);
    //   this.game.assets.markFailed(id, new Error('Missing src attribute'));
    //   return;
    // }

    // let tagName: string;
    // console.log(asset.assetType)
    // switch (asset.assetType) {
    //   case 'image':
    //     tagName = 'img';
    //     break;
    //   case 'audio':
    //     tagName = 'audio';
    //     break;
    //   case 'video':
    //     tagName = 'video';
    //     break;
    //   case 'gltf':
    //   case 'glb':
    //   default:
    //     tagName = 'a-asset-item';
    // }

    // const assetEl = document.createElement(tagName);
    // assetEl.id = id;
    // assetEl.setAttribute('src', asset.src);
    // assetEl.setAttribute('crossorigin', 'anonymous');

    // if (tagName === 'a-asset-item') {
    //   assetEl.setAttribute('response-type', 'arraybuffer');
    // }

    // this.game.assets.markLoading(id);
    // this.setupAssetEventHandlers(assetEl, id);
    // this.assetsEl.appendChild(assetEl);
  }

  /**
   * Set up event handlers for an asset element and check its current load state
   * @param element The asset DOM element
   * @param id Asset ID
   */
  private setupAssetEventHandlers(element: Element, id: string): void {
    const loadHandler = () => {
      this.handleAssetLoaded(id);
    };

    const errorHandler = (e: Event) => {
      this.game.assets.markFailed(
        id,
        new Error(`Failed to load asset: ${element.getAttribute('src')}`),
      );
    };

    if (element.tagName.toLowerCase() === 'a-asset-item') {
      element.addEventListener('loaded', loadHandler);
    } else {
      element.addEventListener('load', loadHandler);
    }
    element.addEventListener('error', errorHandler);
    
    this.checkAssetLoadState(element, id);
  }

  /**
   * Check if an asset is already loaded
   * @param element The asset DOM element
   * @param id Asset ID
   */
  private checkAssetLoadState(element: Element, id: string): void {
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'img') {
      if ((element as HTMLImageElement).complete) {
        this.handleAssetLoaded(id);
      }
    } else if (tagName === 'audio' || tagName === 'video') {
      const mediaElement = element as HTMLMediaElement;
      // HAVE_ENOUGH_DATA = 4 means loaded enough to play
      if (mediaElement.readyState >= 4) {
        this.handleAssetLoaded(id);
      }
    } else if (tagName === 'a-asset-item') {
      const aframeAsset = element as Entity;
      if ((aframeAsset as any).data !== undefined || (aframeAsset as any).hasLoaded) {
        this.handleAssetLoaded(id);
      }
    }
  }

  /**
   * Handle successful loading of an asset
   * @param id Asset ID
   */
  private handleAssetLoaded(id: string): void {
    this.game.assets.markLoaded(id);
  }
}

customElements.define('asset-bridge', AssetBridge);