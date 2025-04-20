import { AssetType } from '@/types/loadable-store';
import { LoadResult } from '@/types/loader';
import { IGame } from '@/types';
import { GameStoreService } from '@/services/GameStoreService';

/**
 * Monitor that integrates with A-Frame's asset management system
 * to track asset loading status for the game state
 */
export class AFrameAssetMonitor {
  private assetLoadPromises: Map<string, { 
    resolve: (result: LoadResult) => void; 
    reject: (error: Error) => void 
  }>;
  private assetsEl: HTMLElement | null = null;
  private initialized = false;
  readonly game: IGame;

  constructor() {
    this.assetLoadPromises = new Map();
    this.game = GameStoreService.getInstance();
    
    // Initialize immediately if document is ready, otherwise wait for DOM load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  /**
   * Initialize the monitor by finding the a-assets element and setting up event listeners
   */
  private initialize() {
    // Get scene from the game's SceneManager
    const scene = this.game.state.scene;
    
    if (!scene) {
      console.warn('No A-Frame scene found in game state. Will try again when loading assets.');
      return;
    }
    
    // Find or create the a-assets element
    this.assetsEl = scene.querySelector('a-assets');
    
    if (!this.assetsEl) {
      console.warn('No a-assets element found in the scene. Will create one when loading assets.');
      return;
    }
    
    this.setupEventListeners();
    this.initialized = true;
  }

  /**
   * Set up event listeners on the a-assets element
   */
  private setupEventListeners() {
    if (!this.assetsEl) return;

    // Listen for asset load events
    this.assetsEl.addEventListener('loaded', this.onAssetsLoaded.bind(this));
    
    // Monitor individual assets - note A-Frame uses custom events
    this.assetsEl.addEventListener('asset-loaded', this.onAssetLoaded.bind(this) as EventListener);
    this.assetsEl.addEventListener('error', this.onAssetError.bind(this), true);
  }

  /**
   * Handler for when all assets are loaded
   */
  private onAssetsLoaded(event: Event) {
    console.log('All assets loaded');
    // Any additional game state updates for all assets loaded
  }

  /**
   * Handler for individual asset load event
   */
  private onAssetLoaded(event: Event) {
    // A-Frame might use custom events or regular events
    const customEvent = event as unknown as CustomEvent;
    const assetEl = (customEvent.detail?.target || event.target) as HTMLElement;
    const src = assetEl.getAttribute('src');
    
    if (src && this.assetLoadPromises.has(src)) {
      const { resolve } = this.assetLoadPromises.get(src)!;
      console.log(`Asset loaded: ${src}`);
      resolve({ success: true });
      this.assetLoadPromises.delete(src);
    }
  }

  /**
   * Handler for asset error event
   */
  private onAssetError(event: ErrorEvent) {
    const assetEl = event.target as HTMLElement;
    if (!assetEl || !assetEl.getAttribute) return;
    
    const src = assetEl.getAttribute('src');
    if (!src) return;
    
    if (this.assetLoadPromises.has(src)) {
      const { reject } = this.assetLoadPromises.get(src)!;
      console.error(`Asset failed to load: ${src}`, event);
      reject(new Error(`Failed to load asset: ${src}`));
      this.assetLoadPromises.delete(src);
    }
  }

  /**
   * Load an asset through A-Frame's asset management system
   * @param src Source URL of the asset
   * @param type Type of the asset
   * @returns Promise that resolves when the asset is loaded
   */
  loadAsset(src: string, type: AssetType): Promise<LoadResult> {
    return new Promise<LoadResult>((resolve, reject) => {
      // Initialize if not already done
      if (!this.initialized) {
        this.initialize();
      }
      
      // Ensure we have access to the game instance
      if (!this.game) {
        reject(new Error('No game instance available for asset loading'));
        return;
      }
      
      // Get scene from the game's SceneManager
      const scene = this.game.state.scene;
      
      if (!scene) {
        reject(new Error('No A-Frame scene found in game state'));
        return;
      }
      
      // Find or create a-assets element if needed
      if (!this.assetsEl) {
        // Try to find it in the scene
        this.assetsEl = scene.querySelector('a-assets');
        
        // If still not found, create it using the SceneManager's scene
        if (!this.assetsEl) {
          this.assetsEl = document.createElement('a-assets');
          scene.appendChild(this.assetsEl);
          this.setupEventListeners();
          this.initialized = true;
        }
      }
      
      // Store the promise handlers for later resolution
      this.assetLoadPromises.set(src, { resolve, reject });
      
      // Check if asset is already in A-Frame's asset system
      const assetEl = this.findOrCreateAsset(src, type);
      
      // If already loaded, resolve immediately - check appropriate property based on element type
      if (this.isAssetLoaded(assetEl, type)) {
        resolve({ success: true });
        this.assetLoadPromises.delete(src);
      }
      
      // Set timeout for loading
      const timeoutId = setTimeout(() => {
        if (this.assetLoadPromises.has(src)) {
          reject(new Error(`Timeout loading asset: ${src}`));
          this.assetLoadPromises.delete(src);
        }
      }, 30000); // 30 second timeout
      
      // Update promise handlers to clean up timeout
      const originalResolve = resolve;
      const originalReject = reject;
      
      this.assetLoadPromises.set(src, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          originalResolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          originalReject(error);
        }
      });
    });
  }

  /**
   * Check if an asset is already loaded based on its type
   */
  private isAssetLoaded(assetEl: HTMLElement, type: AssetType): boolean {
    if ((assetEl as any).hasLoaded) {
      return true;
    }
    
    // Check element-specific properties
    switch (type) {
      case 'image':
        return (assetEl as HTMLImageElement).complete;
      case 'audio':
      case 'video':
        const media = assetEl as HTMLMediaElement;
        return media.readyState >= 4; // HAVE_ENOUGH_DATA
      default:
        return false;
    }
  }

  /**
   * Find an existing asset element or create a new one
   * @param src Source URL of the asset
   * @param type Type of the asset
   * @returns The asset element
   */
  private findOrCreateAsset(src: string, type: AssetType): HTMLElement {
    if (!this.assetsEl) {
      throw new Error('A-Frame assets element not found');
    }
    
    // Check if asset already exists
    const existingAssets = Array.from(this.assetsEl.children) as HTMLElement[];
    const assetEl = existingAssets.find(el => el.getAttribute && el.getAttribute('src') === src);
    
    // If asset already exists, return it
    if (assetEl) {
      return assetEl;
    }
    
    // Otherwise, create a new element based on asset type
    const newAssetEl = document.createElement(this.getElementTypeForAsset(type));
    newAssetEl.setAttribute('src', src);
    newAssetEl.setAttribute('crossorigin', 'anonymous');
    
    // Add event listeners specific to this element type
    switch (type) {
      case 'image':
        (newAssetEl as HTMLImageElement).addEventListener('load', () => {
          this.onAssetLoaded(new Event('load', { bubbles: true }));
        });
        newAssetEl.addEventListener('error', this.onAssetError.bind(this) as EventListener);
        break;
        
      case 'audio':
      case 'video':
        (newAssetEl as HTMLMediaElement).addEventListener('canplaythrough', () => {
          this.onAssetLoaded(new Event('canplaythrough', { bubbles: true }));
        });
        newAssetEl.addEventListener('error', this.onAssetError.bind(this) as EventListener);
        break;
        
      case 'gltf':
      case 'glb':
        // A-Frame asset item loads are handled by A-Frame's asset system
        // We rely on the asset-loaded event from a-assets
        break;
        
      default:
        // Generic handling for other asset types
        newAssetEl.addEventListener('load', () => {
          this.onAssetLoaded(new Event('load', { bubbles: true }));
        });
        newAssetEl.addEventListener('error', this.onAssetError.bind(this) as EventListener);
    }
    
    // Add to the assets element
    this.assetsEl.appendChild(newAssetEl);
    
    return newAssetEl;
  }
  
  /**
   * Get the appropriate HTML element type for the asset type
   */
  private getElementTypeForAsset(type: AssetType): string {
    switch (type) {
      case 'image': return 'img';
      case 'gltf':
      case 'glb': return 'a-asset-item';
      case 'audio': return 'audio';
      case 'video': return 'video';
      default: return 'a-asset-item';
    }
  }
}
