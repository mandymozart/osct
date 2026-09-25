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
  NOT_SUPPORTED = "not-supported",
  // game.config.json does not match the contract (shared/guards) – details in ErrorInfo.details
  GAME_CONFIGURATION_INVALID = "game-configuration-invalid",
  NOT_FOUND = "not-found",
  NAVIGATION_FAILED = "navigation-failed",
  NETWORK_ERROR = "network-error",
  TIMEOUT = "timeout",

  // Spread errors
  SPREAD_NOT_FOUND = "spread-not-found",
  SPREAD_LOAD_FAILED = "spread-load-failed",
  IMAGE_TARGET_NOT_FOUND = "missing-image-target",

  SPREAD_NOT_READY = "spread-not-ready",

  // Entity errors
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

  // Camera errors
  CAMERA_PERMISSION_DENIED = "camera-permission-denied",
}