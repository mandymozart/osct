// Game-related type definitions for build scripts
// These are imported from client/src/types/game/index.ts

import { AssetType, EntityType } from "./content";

export interface IGame {
  version: GameVersion;
  state: GameState;
  initialize(): void;
}

export interface GameState {
  id: string;
  loading: LoadingState;
  mode: GameMode;
  currentChapter: string | null;
  chapters: Record<string, any>;
  trackedTargets: string[];
  currentRoute: string | null;
  currentError: ErrorInfo | null;
  configVersion: ConfigurationVersion;
  cameraPermission: CameraPermissionStatus;
}

export enum ErrorCode {
  UNKNOWN_ERROR = "unknown-error",
  INITIALIZATION_FAILED = "initialization-failed",
  NOT_SUPPORTED = "not-supported",
  NOT_FOUND = "not-found",
  NOT_READY = "not-ready",
  NAVIGATION_FAILED = "navigation-failed",
  NETWORK_ERROR = "network-error",
  TIMEOUT = "timeout",
  CHAPTER_NOT_FOUND = "chapter-not-found",
  ENTITY_LOAD_FAILED = "entity-load-failed",
  CHAPTERS_LOAD_FAILED = "chapters-load-failed",
  CHAPTER_LOAD_FAILED = "chapter-load-failed",
  IMAGE_TARGET_NOT_FOUND = "missing-image-target",
  CHAPTER_NOT_READY = "chapter-not-ready",
  SOME_ASSETS_NOT_FOUND = "some-assets-not-found",
  ASSET_NOT_FOUND = "asset-not-found",
  ASSET_TYPE_INVALID = "asset-type-invalid",
  ASSET_LOAD_FAILED = "asset-load-failed",
  ASSET_NOT_READY = "asset-not-ready",
  SCENE_NOT_FOUND = "scene-not-found",
  SCENE_NOT_READY = "scene-not-ready",
  FAILED_TO_UPDATE_SCENE = "failed-to-update-scene",
  FAILED_TO_ENTER_VR = "failed-to-enter-vr",
  FAILED_TO_EXIT_VR = "failed-to-exit-vr",
  FAILED_TO_SCAN_QR = "failed-to-scan-qr",
  INVALID_QR_CODE = "invalid-qr-code",
  INVALID_QR_URL = "invalid-qr-url",
  CAMERA_PERMISSION_DENIED = "camera-permission-denied"
}

export interface ErrorInfo {
  code: ErrorCode | string;
  msg: string;
  recovery?: {
    actionLabel?: string;
    action?: () => void;
  };
}

export enum GameMode {
  VR = "vr",
  QR = "qr",
  DEFAULT = "default",
  IDLE = "idle"
}

export enum LoadingState {
  LOADING = "loading",
  LOADED = "loaded",
  ERROR = "error"
}

export enum CameraPermissionStatus {
  UNKNOWN = "unknown",
  GRANTED = "granted",
  DENIED = "denied",
  PROMPT = "prompt"
}

export interface GameConfiguration {
  version: ConfigurationVersion;
  initialChapterId: string;
  chapters: ChapterData[];
  tutorial: TutorialStepData[];
}

export interface ConfigurationVersion {
  version: string;
  timestamp: string;
}

export interface GameVersion {
  version: string;
  timestamp: string;
}

export interface ChapterData {
  id: string;
  title: string;
  description: string;
  order: number;
  mindSrc: string;
  targets: string[];
}

export interface TutorialStepData {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface TargetData {
  id: string;
  mindarTargetIndex: number;
  imageTargetSrc: string;
  mindSrc: string;
  bookId: string;
  title: string;
  description: string;
  tags: string[];
  relatedTargets: string[];
  entity: EntityData;
}

export interface EntityData {
  type: EntityType;
  assets: AssetData[];
}

export interface AssetData {
  id: string;
  assetType: string;
  type: AssetType;
  src: string;
  position?: {
    x: number;
    y: number;
    z: number;
  };
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
  scale?: {
    x: number;
    y: number;
    z: number;
  };
}