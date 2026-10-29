/** Error or notice shown by the error overlay; `type` sets severity, `action` adds a button */
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


export enum ErrorCode {
  NOT_SUPPORTED = "not-supported",
  /** game.config.json fails the contract guard (shared/guards); problems in ErrorInfo.details */
  GAME_CONFIGURATION_INVALID = "game-configuration-invalid",
  NOT_FOUND = "not-found",
  NAVIGATION_FAILED = "navigation-failed",
  NETWORK_ERROR = "network-error",
  TIMEOUT = "timeout",

  SPREAD_NOT_FOUND = "spread-not-found",
  SPREAD_LOAD_FAILED = "spread-load-failed",
  IMAGE_TARGET_NOT_FOUND = "missing-image-target",

  SPREAD_NOT_READY = "spread-not-ready",

  ENTITY_LOAD_FAILED = "entity-load-failed",

  ASSET_NOT_FOUND = "asset-not-found",
  ASSET_TYPE_INVALID = "asset-type-invalid",
  ASSET_LOAD_FAILED = "asset-load-failed",
  ASSET_NOT_READY = "asset-not-ready",


  SCENE_NOT_FOUND = "scene-not-found",
  SCENE_NOT_READY = "scene-not-ready",
  FAILED_TO_UPDATE_SCENE = "failed-to-update-scene",

  CAMERA_PERMISSION_DENIED = "camera-permission-denied",
}