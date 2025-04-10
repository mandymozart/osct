import { ChapterData, ChapterState, IChapterManager } from "../chapters";
import { ErrorListener, ErrorInfo } from "../errors";
import { HistoryManagerState, IHistoryManager } from "../history";
import { IQRManager } from "../qr";
import {
  IRouterManager,
  PageRouterConfiguration,
  RouterManagerState,
} from "../router";
import { ISceneManager, SceneManagerState } from "../scene";
import { ITargetManager, TargetManagerState } from "../targets";
import { ILoadableStore, LoadableResource } from "../loadable-store";
import { LoadingState } from "../common.js";

export interface IGame extends ILoadableStore {
  version: ConfigurationVersion; // History and Game version have to match. 
  state: GameState;

  scene: ISceneManager;
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
    ChapterState,
    HistoryManagerState,
    RouterManagerState {
  id: string;
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
  CHAPTER_LOAD_FAILED = "chapter-load-failed",

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

  // QR errors
  INVALID_QR_URL = "invalid-qr-url",
}

export interface GameConfiguration {
  version: string; // Semantic version like "1.0.0"
  initialChapterId: string; // ID of the initial chapter
  chapters: readonly ChapterData[];
  router: PageRouterConfiguration;
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
}
