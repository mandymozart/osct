import { ErrorInfo } from "@/types";

/**
 * Common interface for resources that can be loaded
 */
export interface LoadableResource {
  isLoading: boolean;
  loaded: boolean;
  error: ErrorInfo | null;
  src: string;
  type?: string;
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
  markAsLoading<T>(resource: T): T;

  /**
   * Mark a resource as loaded
   */
  markAsLoaded<T>(resource: T): T;

  /**
   * Mark a resource as failed with an error
   */
  markAsFailed<T>(resource: T, errorCode: string, errorMsg: string): T;

  /**
   * Initialize loading state properties on a resource and its children
   */
  initializeLoadingStates<T>(data: T): T & LoadableResource;

  /**
   * Load a single asset with proper error handling
   */
  loadAsset(src: string, type?: string): Promise<void>;

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
  type?: 'image' | 'gltf' | 'glb' | 'audio' | 'video' | string;
}

/**
 * Asset loading result
 */
export interface AssetLoadResult<T extends LoadableResource> {
  asset: T;
  success: boolean;
  error?: Error;
}