/**
 * Common interface for resources that can be loaded
 */
export interface LoadableResource {
    isLoading: boolean;
    loaded: boolean;
    error: ErrorInfo | null;
  }
  
  /**
   * Error information structure
   */
  export interface ErrorInfo {
    code: string;
    msg: string;
  }
  
  /**
   * Error code constants
   */
  export enum ErrorCode {
    // Chapter errors
    IMAGE_TARGET_NOT_FOUND = "missing-image-target",
    CHAPTER_NOT_FOUND = "chapter-not-found",
    
    // Entity errors
    ENTITY_LOAD_FAILED = "entity-load-failed",
    SOME_ASSETS_NOT_FOUND = "some-assets-not-found",
    
    // Asset errors
    ASSET_LOAD_FAILED = "asset-load-failed",
    ASSET_NOT_FOUND = "asset-not-found",
    
    // Generic errors
    UNKNOWN_ERROR = "unknown-error",
    NETWORK_ERROR = "network-error",
    TIMEOUT = "timeout"
  }
  
  /**
   * Base data structure for a chapter without loading state
   */
  export interface ChapterData {
    id: string;
    order: number;
    title: string;
    imageTargetSrc: string;
    targets: TargetData[];
  }
  
  /**
   * Base data structure for a target without loading state
   */
  export interface TargetData {
    mindarTargetIndex: number;
    bookId: string;
    title: string;
    description: string;
    entity: EntityData;
  }
  
  /**
   * Base data structure for an entity without loading state
   */
  export interface EntityData {
    assets: AssetData[];
  }
  
  /**
   * Base data structure for an asset without loading state
   */
  export interface AssetData {
    id?: string;
    src: string;
    type?: string;
  }
  
  /**
   * Represents a chapter in the game with loading state
   */
  export interface Chapter extends ChapterData, LoadableResource {
    targets: Target[];
  }
  
  /**
   * Represents a tracking target in AR with loading state
   */
  export interface Target extends TargetData, LoadableResource {
    entity: Entity;
  }
  
  /**
   * Represents an entity with assets with loading state
   */
  export interface Entity extends EntityData, LoadableResource {
    assets: Asset[];
  }
  
  /**
   * Represents an asset that can be loaded with loading state
   */
  export interface Asset extends AssetData, LoadableResource {}
  
  /**
   * Game state interface
   */
  export interface GameState {
    scene: any;
    trackedTargets: number[];
    currentChapter: Chapter | null;
    cachedChapters: Record<string, Chapter>;
  }
  
  /**
   * Track the history of seen targets
   */
  export interface TargetHistoryEntry {
    chapterId: string;
    targetIndex: number;
    timestamp: number;
  }