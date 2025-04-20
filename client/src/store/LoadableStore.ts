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

    // Function to load a single asset and return its final state
    const loadSingleAsset = async (asset: T) => {
      try {
        // Only attempt to load assets with a source URL
        if (asset.src) {
          await this.loadAsset(asset.src, asset.type);
        }
        
        // Return successfully loaded asset
        return {
          ...asset,
          status: LoadingState.LOADED,
          error: null
        };
      } catch (error) {
        // Log and return asset with error state
        console.error(`Error loading asset: ${asset.src}`, error);
        return {
          ...asset,
          status: LoadingState.ERROR,
          error: {
            code: ErrorCode.ASSET_LOAD_FAILED,
            msg: error instanceof Error ? error.message : "Unknown error loading asset"
          }
        };
      }
    };

    // Load all assets in parallel and collect results
    const assetLoadResults = await Promise.allSettled(
      assetsInLoadingState.map(loadSingleAsset)
    );
    
    // Process the final results
    return assetLoadResults.map((result, index) => {
      // If the Promise was fulfilled, return the asset state from our try/catch handler
      if (result.status === 'fulfilled') {
        return result.value;
      } 
      
      // This fallback should rarely happen since our loadSingleAsset has its own try/catch,
      // but provides an additional safety net
      return {
        ...assetsInLoadingState[index],
        status: LoadingState.ERROR,
        error: {
          code: ErrorCode.ASSET_LOAD_FAILED,
          msg: result.reason?.message || "Failed to load asset"
        }
      };
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
}