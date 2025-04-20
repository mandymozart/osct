import { ChapterData, ChapterState, IChapterManager } from "../chapters";
import { ErrorListener, ErrorInfo } from "../errors";
import { HistoryManagerState, IHistoryManager } from "../history";
import { IQRManager } from "../qr";
import {
  IRouterManager,
  RouterManagerState,
} from "../router";
import { ISceneManager, SceneManagerState } from "../scene";
import { ITargetManager, TargetManagerState } from "../targets";
import { AssetType, ILoadableStore, LoadableResource } from "../loadable-store";
import { LoadingState } from "../common.js";
import { CameraManagerState, ICameraManager } from "../camera";
import { TutorialStepData } from "../tutorial";

export interface IGame extends ILoadableStore {
  version: ConfigurationVersion; // History and Game version have to match. 
  state: GameState;
  scene: ISceneManager;
  chapters: IChapterManager;
  router: IRouterManager;
  targets: ITargetManager;
  qr: IQRManager;
  history: IHistoryManager;
  camera: ICameraManager;

  initialize(): void;
  startLoading(): void;
  finishLoading(): void;
  setLoadingState(state: LoadingState): void;
  notifyError(error: ErrorInfo): void;
  onError(listener: ErrorListener): void;
}

export interface GameState
  extends ChapterState,
    TargetManagerState,
    HistoryManagerState,
    SceneManagerState,
    RouterManagerState,
    CameraManagerState {
  id: string;
  loading: LoadingState;
  mode: GameMode;
}

/**
 * Error code constants
 */
export enum ErrorCode {
  // Generic errors
  UNKNOWN_ERROR = "unknown-error",
  INITIALIZATION_FAILED = "initialization-failed",
  NOT_SUPPORTED = "not-supported",
  NOT_FOUND = "not-found",
  NOT_READY = "not-ready",
  NAVIGATION_FAILED = "navigation-failed",
  NETWORK_ERROR = "network-error",
  TIMEOUT = "timeout",

  // Chapter errors
  CHAPTER_NOT_FOUND = "chapter-not-found",
  ENTITY_LOAD_FAILED = "entity-load-failed",
  CHAPTERS_LOAD_FAILED = "chapters-load-failed",
  CHAPTER_LOAD_FAILED = "chapter-load-failed",
  IMAGE_TARGET_NOT_FOUND = "missing-image-target",
  
  CHAPTER_NOT_READY = "chapter-not-ready",
  SOME_ASSETS_NOT_FOUND = "some-assets-not-found",

  // Asset errors
  ASSET_NOT_FOUND = "asset-not-found",
  ASSET_TYPE_INVALID = "asset-type-invalid",
  ASSET_LOAD_FAILED = "asset-load-failed",
  ASSET_NOT_READY = "asset-not-ready",


  // Scene errors
  SCENE_NOT_FOUND = "scene-not-found",
  SCENE_NOT_READY = "scene-not-ready",
  FAILED_TO_UPDATE_SCENE = "failed-to-update-scene",
  FAILED_TO_ENTER_VR = "failed-to-enter-vr",
  FAILED_TO_EXIT_VR = "failed-to-exit-vr",

  // QR errors
  FAILED_TO_SCAN_QR = "failed-to-scan-qr",
  INVALID_QR_CODE = "invalid-qr-code",
  INVALID_QR_URL = "invalid-qr-url",

  // Camera errors
  CAMERA_PERMISSION_DENIED = "camera-permission-denied",
}

export interface GameConfiguration {
  version: ConfigurationVersion; 
  initialChapterId: string;
  chapters: readonly ChapterData[];
  tutorial: readonly TutorialStepData[];
}

export interface ConfigurationVersion {
  version: string;
  timestamp: string;
}
export interface GameVersion {
  version: string;
  timestamp: string;
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
  imageTargetSrc: string;
  mindSrc: string;
  tags: string[];
  relatedTargets: string[];
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
  id: string;
  type: AssetType;
  src?: string;
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

/**
 * Game mode lets us know which state the game is in.
 * VR: User is in VR mode (This one is rarely used)
 * QR: User is in QR mode (Only needed when scanning QR codes)
 * DEFAULT: User is in default mode (This is the most common mode)
 */
export enum GameMode {
  VR = "vr",
  QR = "qr",
  DEFAULT = "default",
  IDLE = "idle",
}
