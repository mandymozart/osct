import { produce } from 'immer';
import { AssetType, ErrorCode, ILoadableStore, LoadableResource, LoadingState } from './../types';
import { loader } from './loader';

/**
 * Base class for implementing stores that manage loadable resources
 */
export class LoadableStore implements ILoadableStore{
  state: Record<string, any>;
  listeners: Function[];
  
  constructor() {
    this.state = {};
    this.listeners = [];
  }
  
  /**
   * Update the store state using Immer and notify listeners
   */
  set(newState: Partial<Record<string, any>>): void {
    this.state = produce(this.state, draft => {
      Object.entries(newState).forEach(([key, value]) => {
        draft[key] = value;
      });
    });
    
    this.notifyListeners();
  }
  
  /**
   * Subscribe to state changes
   * @returns Function to unsubscribe
   */
  subscribe(callback: Function): () => void {
    this.listeners.push(callback);
    // Immediately call with current state
    callback(this.state);
    return () => this.unsubscribe(callback);
  }
  
  /**
   * Unsubscribe from state changes
   */
  unsubscribe(callback: Function): void {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }
  
  /**
   * Notify all listeners of state changes
   */
  notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }
  
  /**
   * Set specific state properties on a resource using Immer
   */
  setResourceState<T>(resource: T, state: Partial<LoadableResource>): T {
    if (!resource) return resource;
    
    // Use Immer to update the resource immutably
    return produce<any>(resource, draft => {
      Object.entries(state).forEach(([key, value]) => {
        draft[key] = value;
      });
    });
  }
  
  /**
   * Mark a resource as loading
   * @param resource Resource to mark as loading
   * @returns Resource with loading state
   */
  markAsLoading<T extends LoadableResource>(resource: T): T {
    return {
      ...resource,
      status: LoadingState.LOADING,
      error: null,
    };
  }

  /**
   * Mark a resource as loaded
   * @param resource Resource to mark as loaded
   * @returns Resource with loaded state
   */
  markAsLoaded<T extends LoadableResource>(resource: T): T {
    return {
      ...resource,
      status: LoadingState.LOADED,
      error: null,
    };
  }

  /**
   * Mark a resource as failed
   * @param resource Resource to mark as failed
   * @param code Error code
   * @param message Error message
   * @returns Resource with error state
   */
  markAsFailed<T extends LoadableResource>(
    resource: T,
    code: ErrorCode,
    message: string
  ): T {
    return {
      ...resource,
      status: LoadingState.ERROR,
      error: {
        code,
        msg: message,
      },
    };
  }
  
  /**
   * Initialize loading state properties on a resource and its children using Immer
   */
  initializeLoadingStates<T>(data: T): T & LoadableResource {
    // Deep clone the data first
    const clonedData = JSON.parse(JSON.stringify(data));
    
    // Use Immer to initialize loading states
    return produce<any>(clonedData, draft => {
      // Add loading state properties
      draft.isLoading = false;
      draft.loaded = false;
      draft.error = null;
      
      // Initialize children recursively if they exist
      if (Array.isArray(draft.children)) {
        draft.children = draft.children.map((child: any) => 
          this.initializeLoadingStates(child)
        );
      }
    });
  }
  
  /**
   * Load a single asset
   * @param src Asset source URL
   * @param type Asset type (image, gltf, etc.)
   * @returns Promise that resolves when the asset is loaded
   */
  async loadAsset(src: string, type: AssetType = 'image'): Promise<void> {
    const result = await loader.load({ src, type });
    
    if (!result.success && result.error) {
      throw result.error;
    }
  }

  /**
   * Load multiple assets in parallel
   * @param assets Array of assets to load
   * @returns Promise that resolves with loaded assets
   */
  async loadAssets<T extends LoadableResource>(assets: T[]): Promise<T[]> {
    // Early return for empty asset arrays
    if (!assets || assets.length === 0) {
      return [];
    }

    // Mark all assets as loading
    const assetsInLoadingState = assets.map(asset => ({
      ...asset,
      status: LoadingState.LOADING,
      error: null
    }));

    // Process assets based on whether they need loading
    const assetsRequiringLoad = assetsInLoadingState
      .filter(asset => !!asset.src && asset.type !== 'link'); // Filter out link-type assets (no loading required)

    // Load assets requiring an actual resource
    const loadOptions = assetsRequiringLoad.map(asset => ({
      src: asset.src as string,
      type: asset.type
    }));
    
    const assetLoadResults = loadOptions.length > 0 
      ? await loader.loadMany(loadOptions) 
      : [];
    
    // Process the final results - combine link-type assets (auto success) with loaded assets
    return assetsInLoadingState.map(asset => {
      // Link-type assets are automatically considered loaded
      if (asset.type === 'link' || !asset.src) {
        return {
          ...asset,
          status: LoadingState.LOADED,
          error: null
        };
      }
      
      // Find the loading result for this asset
      const index = assetsRequiringLoad.findIndex(loadAsset => 
        loadAsset.src === asset.src && loadAsset.type === asset.type);
        
      if (index === -1) {
        // This shouldn't happen, but handle it just in case
        console.warn(`No load result found for asset: ${asset.src}`);
        return asset;
      }
      
      const result = assetLoadResults[index];
      
      if (result.success) {
        return {
          ...asset,
          status: LoadingState.LOADED,
          error: null
        };
      } else {
        return {
          ...asset,
          status: LoadingState.ERROR,
          error: {
            code: ErrorCode.ASSET_LOAD_FAILED,
            msg: result.error?.message || "Failed to load asset"
          }
        };
      }
    });
  }
}