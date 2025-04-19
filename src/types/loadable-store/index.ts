import { ErrorInfo, LoadingState } from "@/types";

/**
 * Asset type definition for consistent type usage across the system
 */
export type AssetType = 'image' | 'gltf' | 'glb' | 'audio' | 'video' | 'link' | string;

/**
 * Common interface for resources that can be loaded
 */
export interface LoadableResource {
  error: ErrorInfo | null;
  src: string;
  type?: AssetType;
  status: LoadingState;
}

/**
 * Interface for stores that manage loadable resources
 */
export interface ILoadableStore {
  /**
   * Current state of the store
   */
  state: Record<string, any>;

  /**
   * List of state change listeners
   */
  listeners: Function[];

  /**
   * Update the store state and notify listeners
   */
  set(newState: Partial<Record<string, any>>): void;

  /**
   * Subscribe to state changes
   * @returns Function to unsubscribe
   */
  subscribe(callback: Function): () => void;

  /**
   * Unsubscribe from state changes
   */
  unsubscribe(callback: Function): void;

  /**
   * Notify all listeners of state changes
   */
  notifyListeners(): void;

  /**
   * Set specific state properties on a resource
   */
  setResourceState<T>(resource: T, state: Partial<LoadableResource>): T;

  /**
   * Mark a resource as loading
   */
  markAsLoading<T extends LoadableResource>(resource: T): T;

  /**
   * Mark a resource as loaded
   */
  markAsLoaded<T extends LoadableResource>(resource: T): T;

  /**
   * Mark a resource as failed with an error
   * @param resource Resource to mark as failed
   * @param code Error code
   * @param message Error message
   * @returns Resource with error state
   */
  markAsFailed<T extends LoadableResource>(resource: T, code: string, message: string): T;

  /**
   * Initialize loading state properties on a resource and its children
   */
  initializeLoadingStates<T>(data: T): T & LoadableResource;

  /**
   * Load a single asset with proper error handling
   */
  loadAsset(src: string, type?: AssetType): Promise<void>;

  /**
   * Load multiple assets in parallel with individual error handling
   */
  loadAssets<T extends LoadableResource>(assets: T[]): Promise<T[]>;
}

/**
 * Asset loading options
 */
export interface AssetLoadOptions {
  timeout?: number;
  crossOrigin?: boolean;
  type?: AssetType;
}

/**
 * Asset loading result
 */
export interface AssetLoadResult<T extends LoadableResource> {
  asset: T;
  success: boolean;
  error?: Error;
}