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
   * Subscribe to state changes, immediately calls the callback with current state and returns unsubscribe function
   * @param callback Function to call on state change
   * @returns Unsubscribe function
   */
  subscribe(callback: Function): () => void {
    this.listeners.push(callback);
    callback(this.state);
    return () => this.unsubscribe(callback);
  }

  /**
   * Unsubscribe from state changes
   * @param callback Function to remove from listeners
   */
  unsubscribe(callback: Function): void {
    this.listeners = this.listeners.filter(l => l !== callback);
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
}

// Export types
export { LoadingState, ErrorCode, type AssetType, type LoadableResource };