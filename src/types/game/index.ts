import {
  ChapterData,
  ChapterState,
  ErrorInfo,
  ErrorListener,
  HistoryManagerState,
  IChapterManager,
  IHistoryManager,
  IQRManager,
  IRouterManager,
  ISceneManager,
  ITargetManager,
  ITutorialManager,
  LoadableResource,
  ILoadableStore,
  RouterConfig,
  RouterManagerState,
  SceneManagerState,
  TargetManagerState,
  TutorialState,
  TutorialStepData,
  LoadingState,
} from "../";

export interface IGame extends ILoadableStore {
  configuration: GameConfiguration;
  state: GameState;

  scene: ISceneManager;
  tutorial: ITutorialManager;
  chapters: IChapterManager;
  router: IRouterManager;
  targets: ITargetManager;
  qr: IQRManager;
  history: IHistoryManager;

  initialize(): void;
  notifyError(error: ErrorInfo): void;
  onError(listener: ErrorListener): void;
}

export interface GameState
  extends SceneManagerState,
    TargetManagerState,
    TutorialState,
    ChapterState,
    HistoryManagerState,
    RouterManagerState {
  loading: LoadingState;
  mode: GameMode;
}

/**
 * Error code constants
 */
export enum ErrorCode {
  // Chapter errors
  IMAGE_TARGET_NOT_FOUND = "missing-image-target",
  CHAPTER_NOT_FOUND = "chapter-not-found",
  CHAPTERS_LOAD_FAILED = "chapters-load-failed",

  // Entity errors
  ENTITY_LOAD_FAILED = "entity-load-failed",
  SOME_ASSETS_NOT_FOUND = "some-assets-not-found",

  // Asset errors
  ASSET_LOAD_FAILED = "asset-load-failed",
  ASSET_NOT_FOUND = "asset-not-found",

  // Generic errors
  UNKNOWN_ERROR = "unknown-error",
  NETWORK_ERROR = "network-error",
  TIMEOUT = "timeout",

  // Scene errors
  FAILED_TO_ENTER_VR = "failed-to-enter-vr",
  FAILED_TO_EXIT_VR = "failed-to-exit-vr",
  SCENE_NOT_FOUND = "scene-not-found",
  FAILED_TO_UPDATE_SCENE = "failed-to-update-scene",
}

export interface GameConfiguration {
  version: string | null; // Semantic version like "1.0.0"
  chapters: readonly ChapterData[];
  router: RouterConfig | null;
  tutorial: readonly TutorialStepData[];
}

export interface ConfigurationVersion {
  version: string | null;
  timestamp: number;
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
 * Track the history of seen targets
 */
export interface TargetHistoryEntry {
  chapterId: string;
  targetIndex: number;
  timestamp: number;
}

export enum GameMode {
  VR = "vr",
  QR = "qr",
  DEFAULT = "default",
}
