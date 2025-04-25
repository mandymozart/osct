/**
 * Error information structure
 */
export interface ErrorInfo {
  code: string;
  msg: string;
  type?: "critical" | "warning" | "info";
  details?: any;
  action?: {
    text: string;
    callback: () => void;
  };
}

export type ErrorListener = (error: ErrorInfo) => void;


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
  CHAPTERS_LOAD_FAILED = "chapters-load-failed",
  CHAPTER_LOAD_FAILED = "chapter-load-failed",
  IMAGE_TARGET_NOT_FOUND = "missing-image-target",

  CHAPTER_NOT_READY = "chapter-not-ready",
  SOME_ASSETS_NOT_FOUND = "some-assets-not-found",

  // Entity errors
  ENTITY_NOT_FOUND = "entity-not-founds",
  ENTITY_LOAD_FAILED = "entity-load-failed",

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