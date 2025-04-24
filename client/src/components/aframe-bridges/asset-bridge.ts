import { GameStoreService } from '@/services/GameStoreService';
import { AssetData, GameState, IGame, LoadingState } from '@/types';
import { AssetState } from '@/types/assets';
import { getAsset } from '@/utils/config';
import { Entity } from 'aframe';

class AssetBridge extends HTMLElement {
  private game: IGame;
  private assetsEl: Entity | null = null;
  private processedAssets: Set<string> = new Set();
  private initialized: boolean = false;
  private initializing: boolean = false;
  private sceneListenerAdded: boolean = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.game = GameStoreService.getInstance();
    this.game.subscribe(this.handleStateChange.bind(this));
    
    // The scene may not be available immediately, so we'll check on state change
    if (this.game.state.scene) {
      this.setupScene(this.game.state.scene);
    }
  }

  /**
   * Set up event listeners for the A-Frame scene
   * @param scene The A-Frame scene element
   */
  private setupScene(scene: Entity): void {
    if (this.sceneListenerAdded) return;
    
    // Find the a-assets container
    this.assetsEl = scene.querySelector('a-assets');
    if (!this.assetsEl) {
      console.warn('[AssetBridge] No a-assets element found in scene');
      
      // Listen for when assets container is added to the scene
      scene.addEventListener('child-attached', ((event: Event) => {
        // Type assertion to access A-Frame's custom event detail property
        const detail = (event as any).detail;
        if (detail && detail.el && detail.el.tagName.toLowerCase() === 'a-assets') {
          console.log('[AssetBridge] A-Frame assets container attached to scene');
          this.assetsEl = detail.el as Entity;
          
          // Register existing assets now that we have the container
          if (!this.initialized && !this.initializing) {
            this.registerExistingAssets();
          }
        }
      }) as EventListener);
    } else {
      // Assets container exists, register any assets already in it
      if (!this.initialized && !this.initializing) {
        this.registerExistingAssets();
      }
    }
    
    // Listen for scene loaded event
    scene.addEventListener('loaded', (() => {
      console.log('[AssetBridge] A-Frame scene loaded');
      // Re-check for existing assets once the scene is fully loaded
      if (this.assetsEl && !this.initialized && !this.initializing) {
        this.registerExistingAssets();
      }
    }) as EventListener);
    
    this.sceneListenerAdded = true;
  }

  /**
   * Handle state changes from the game store
   * @param state Current game state
   */
  private handleStateChange(state: GameState) {
    // Setup scene if it's just been added to the state
    if (state.scene && !this.sceneListenerAdded) {
      this.setupScene(state.scene);
    }
    
    // Handle asset state changes only after initialization is complete
    if (state.assets && this.initialized && !this.initializing) {
      this.handleAssetsStateChange(state.assets);
    }
  }

  /**
   * Register any existing assets already in the A-Frame scene
   */
  private registerExistingAssets(): void {
    if (!this.assetsEl) return;
    if (this.initializing || this.initialized) return;
    
    // Set initializing flag to prevent recursion
    this.initializing = true;
    
    console.log('[AssetBridge] Registering existing assets...');
    
    // Get all asset elements within the a-assets container
    const assetElements = this.assetsEl.querySelectorAll(
      'img, audio, video, a-asset-item',
    );

    console.log(
      `[AssetBridge] Found ${assetElements.length} existing assets in scene`,
    );

    // Process each asset element
    assetElements.forEach((element) => {
      const id = element.id;
      if (!id) {
        console.warn(
          '[AssetBridge] Found asset element without ID, skipping:',
          element,
        );
        return;
      }

      // Skip if already processed
      if (this.processedAssets.has(id)) {
        return;
      }

      // Create initial asset state as loading
      const assetState: AssetState = {
        status: LoadingState.LOADING,
      };

      // Register with asset manager
      this.game.assets.register(id, assetState);
      
      // Add to processed set
      this.processedAssets.add(id);

      console.log(`[AssetBridge] Registered existing asset: ${id}`);

      // Setup event handlers and check current load state
      this.setupAssetEventHandlers(element, id);
    });

    // Set initialized flag
    this.initialized = true;
    this.initializing = false;
    
    console.log('[AssetBridge] Initialization complete');
  }

  /**
   * Process asset state changes and create DOM elements as needed
   * @param assets Current asset state from game state
   */
  private handleAssetsStateChange(assets: Record<string, AssetState>): void {
    // Skip if we're currently initializing to prevent recursion
    if (this.initializing) return;
    
    Object.entries(assets).forEach(([id, state]) => {
      if (this.processedAssets.has(id)) return;
    
      console.log(`[AssetBridge] Processing new asset from state: ${id}`);
    
      // Create element in DOM
      if(state.status === LoadingState.INITIAL) {
        this.createAssetElement(id);
      }
      
      // Mark as processed
      this.processedAssets.add(id);
    });
  }

  /**
   * Create an asset element in the DOM
   * @param id Asset ID
   */
  private createAssetElement(id: string): void {
    if (!this.assetsEl) return;

    const asset: AssetData | undefined = getAsset(id);
    if (!asset) {
      console.error(`Asset ${id} not found in configuration`);
      return;
    }

    const existingEl = this.game.state.scene?.querySelector(`#${id}`);
    if (existingEl) {
      console.log(`[AssetBridge] Asset ${id} already exists in DOM, skipping creation`);
      return;
    }

    console.log(
      `[AssetBridge] Creating DOM element for asset: ${id} (${asset.src})`,
    );

    // Skip if this is a link type asset
    if (asset.assetType === 'link') {
      this.game.assets.markLoaded(id);
      return;
    }
    
    // Ensure src is available
    if (!asset.src) {
      console.error(`Asset "${id}" of type ${asset.assetType} requires src attribute`);
      this.game.assets.markFailed(id, new Error('Missing src attribute'));
      return;
    }

    // Select appropriate element type
    let tagName: string;
    console.log(asset.assetType)
    switch (asset.assetType) {
      case 'image':
        tagName = 'img';
        break;
      case 'audio':
        tagName = 'audio';
        break;
      case 'video':
        tagName = 'video';
        break;
      case 'gltf':
      case 'glb':
      default:
        tagName = 'a-asset-item';
    }

    // Create element
    const assetEl = document.createElement(tagName);
    assetEl.id = id;
    assetEl.setAttribute('src', asset.src);
    assetEl.setAttribute('crossorigin', 'anonymous');

    if (tagName === 'a-asset-item') {
      assetEl.setAttribute('response-type', 'arraybuffer');
    }

    // Mark as loading in the asset manager
    this.game.assets.markLoading(id);
    
    // Setup event handlers
    this.setupAssetEventHandlers(assetEl, id);
    
    // Add to DOM
    this.assetsEl.appendChild(assetEl);
  }

  /**
   * Set up event handlers for an asset element and check its current load state
   * @param element The asset DOM element
   * @param id Asset ID
   */
  private setupAssetEventHandlers(element: Element, id: string): void {
    // Set up event handlers
    const loadHandler = () => {
      this.handleAssetLoaded(id);
    };

    const errorHandler = (e: Event) => {
      this.game.assets.markFailed(
        id,
        new Error(`Failed to load asset: ${element.getAttribute('src')}`),
      );
    };

    // Add event listeners based on element type
    if (element.tagName.toLowerCase() === 'a-asset-item') {
      element.addEventListener('loaded', loadHandler);
    } else {
      element.addEventListener('load', loadHandler);
    }
    element.addEventListener('error', errorHandler);
    
    // Check current load state
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
      // For images, check the complete property
      if ((element as HTMLImageElement).complete) {
        this.handleAssetLoaded(id);
      }
    } else if (tagName === 'audio' || tagName === 'video') {
      // For media elements, check readyState
      const mediaElement = element as HTMLMediaElement;
      // HAVE_ENOUGH_DATA = 4 means loaded enough to play
      if (mediaElement.readyState >= 4) {
        this.handleAssetLoaded(id);
      }
    } else if (tagName === 'a-asset-item') {
      // For A-Frame asset items
      const aframeAsset = element as Entity;
      // Check A-Frame specific properties that indicate loaded state
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

  /**
   * Clean up when component is removed
   */
  disconnectedCallback(): void {
    this.processedAssets.clear();
  }
}

customElements.define('asset-bridge', AssetBridge);