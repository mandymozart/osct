import { produce } from 'immer';
import { ErrorCode, ILoadableStore, LoadableResource } from './../types';

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
   */
  markAsLoading<T>(resource: T): T {
    return this.setResourceState(resource, {
      isLoading: true,
      loaded: false,
      error: null
    });
  }
  
  /**
   * Mark a resource as loaded
   */
  markAsLoaded<T>(resource: T): T {
    return this.setResourceState(resource, {
      isLoading: false,
      loaded: true
    });
  }
  
  /**
   * Mark a resource as failed with an error
   */
  markAsFailed<T>(resource: T, errorCode: string, errorMsg: string): T {
    return this.setResourceState(resource, {
      isLoading: false,
      loaded: false,
      error: {
        code: errorCode,
        msg: errorMsg
      }
    });
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
   * Load a single asset with proper error handling
   * @param src Asset source URL
   * @param type Asset type (image, gltf, etc.)
   * @returns Promise that resolves when the asset is loaded
   */
  loadAsset(src: string, type: string = 'image'): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout loading asset: ${src}`));
      }, 30000); // 30 second timeout
      
      // Different loading strategies based on asset type
      switch (type?.toLowerCase()) {
        case 'image':
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
          break;
          
        case 'gltf':
        case 'glb':
          // For GLTF models, we pre-fetch to check availability
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
          break;
          
        case 'audio':
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
          break;
          
        case 'video':
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
          break;
          
        default:
          // For unknown types, just try to fetch the file
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
    });
  }
  
  /**
   * Load multiple assets in parallel with individual error handling
   * @param assets Array of asset objects
   * @returns Promise that resolves with updated asset objects
   */
  async loadAssets<T extends LoadableResource>(assets: T[]): Promise<T[]> {
    try {
      // Mark all assets as loading first
      let workingAssets = assets.map(asset => this.markAsLoading(asset));
      
      // Create loading promises for all assets
      const loadingPromises = workingAssets.map((asset, index) => 
        this.loadAsset(asset['src'], asset['type'])
          .then(() => {
            // Mark asset as loaded
            workingAssets[index] = this.markAsLoaded(asset);
            return workingAssets[index];
          })
          .catch(error => {
            // Mark asset as failed
            workingAssets[index] = this.markAsFailed(
              asset, 
              ErrorCode.ASSET_LOAD_FAILED,
              error.message || `Failed to load asset: ${asset['src']}`
            );
            return workingAssets[index];
          })
      );
      
      // Wait for all assets to finish loading (success or failure)
      await Promise.allSettled(loadingPromises);
      
      return workingAssets;
    } catch (error) {
      console.error("Error in loadAssets:", error);
      throw error;
    }
  }
}