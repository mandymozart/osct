import { produce } from 'immer';
import { AssetType, ErrorCode, ILoadableStore, LoadableResource, LoadingState } from './../types';

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
      // Keep for backward compatibility
      isLoading: true,
      loaded: false,
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
      // Keep for backward compatibility
      isLoading: false,
      loaded: true,
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
      // Keep for backward compatibility
      isLoading: false,
      loaded: false,
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
    if (!assets || assets.length === 0) {
      return [];
    }

    console.log(`Loading ${assets.length} assets...`);

    // Mark all assets as loading
    const loadingAssets = assets.map(asset => ({
      ...asset,
      status: LoadingState.LOADING,
      // Keep for backward compatibility
      isLoading: true,
      loaded: false,
      error: null
    }));

    // Load all assets in parallel
    const results = await Promise.allSettled(
      loadingAssets.map(async (asset) => {
        try {
          await this.loadAsset(asset.src, asset.type);
          return {
            ...asset,
            status: LoadingState.LOADED,
            // Keep for backward compatibility
            isLoading: false,
            loaded: true,
            error: null
          };
        } catch (error) {
          console.error(`Error loading asset: ${asset.src}`, error);
          return {
            ...asset,
            status: LoadingState.ERROR,
            // Keep for backward compatibility
            isLoading: false,
            loaded: false,
            error: {
              code: ErrorCode.ASSET_LOAD_FAILED,
              msg: error instanceof Error ? error.message : "Unknown error loading asset"
            }
          };
        }
      })
    );

    // Process results
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // This should not happen with our try/catch, but just in case
        return {
          ...loadingAssets[index],
          status: LoadingState.ERROR,
          // Keep for backward compatibility
          isLoading: false,
          loaded: false,
          error: {
            code: ErrorCode.ASSET_LOAD_FAILED,
            msg: result.reason?.message || "Failed to load asset"
          }
        };
      }
    });
  }

  /**
   * Load a single asset
   * @param src Asset source URL
   * @param type Asset type (image, gltf, etc.)
   * @returns Promise that resolves when the asset is loaded
   */
  loadAsset(src: string, type: AssetType = 'image'): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout loading asset: ${src}`));
      }, 30000); // 30 second timeout

      try {
        switch (type) {
          case 'image':
            this.loadImageAsset(src, timeout, resolve, reject);
            break;
          case 'gltf':
          case 'glb':
            this.loadGLTFAsset(src, timeout, resolve, reject);
            break;
          case 'audio':
            this.loadAudioAsset(src, timeout, resolve, reject);
            break;
          case 'video':
            this.loadVideoAsset(src, timeout, resolve, reject);
            break;
          default:
            // For unknown types, we'll just try to fetch the resource
            this.loadGenericAsset(src, timeout, resolve, reject);
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  loadImageAsset(src: string, timeout: NodeJS.Timeout, resolve: (value: void | PromiseLike<void>) => void, reject: (reason: any) => void): void {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load image: ${src}`));
    };
    img.src = src;
  }

  loadGLTFAsset(src: string, timeout: NodeJS.Timeout, resolve: (value: void | PromiseLike<void>) => void, reject: (reason: any) => void): void {
    fetch(src)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        clearTimeout(timeout);
        resolve();
      })
      .catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
  }

  loadAudioAsset(src: string, timeout: NodeJS.Timeout, resolve: (value: void | PromiseLike<void>) => void, reject: (reason: any) => void): void {
    const audio = new Audio();
    audio.oncanplaythrough = () => {
      clearTimeout(timeout);
      resolve();
    };
    audio.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load audio: ${src}`));
    };
    audio.src = src;
  }

  loadVideoAsset(src: string, timeout: NodeJS.Timeout, resolve: (value: void | PromiseLike<void>) => void, reject: (reason: any) => void): void {
    const video = document.createElement('video');
    video.oncanplaythrough = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load video: ${src}`));
    };
    video.src = src;
    video.load();
  }

  loadGenericAsset(src: string, timeout: NodeJS.Timeout, resolve: (value: void | PromiseLike<void>) => void, reject: (reason: any) => void): void {
    fetch(src)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        clearTimeout(timeout);
        resolve();
      })
      .catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
  }
}