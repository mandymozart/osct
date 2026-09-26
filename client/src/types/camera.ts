/**
 * Camera permission status enumeration
 */
export enum CameraPermissionStatus {
  UNKNOWN = 'unknown',
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt',
  /** No camera API: insecure connection (http on a network address) or no camera support */
  UNAVAILABLE = 'unavailable',
  /**
   * Access granted, but the camera sends no picture (seen on Android Chrome after another app used the
   * camera – only a browser restart helped). Set by `<ar-bridge>` when the camera start times out.
   */
  NOT_RESPONDING = 'not-responding',
}

/**
 * Camera manager state interface
 */
export interface CameraManagerState {
  cameraPermission: CameraPermissionStatus;
}

/**
 * Camera manager interface
 */
export interface ICameraManager {
  /**
   * Check and handle camera permission
   * @returns Promise resolving to true if permission granted, false otherwise
   */
  checkPermission(): Promise<boolean>;
  
  /**
   * Request camera access explicitly
   * @returns Promise resolving to true if permission granted, false otherwise
   */
  requestAccess(): Promise<boolean>;

  /** The camera started but sends no picture (camera start timed out) – the overlay tells how to recover */
  reportNotResponding(): void;
  
  /**
   * Show instructions for enabling camera access in browser settings
   * (Responsibility handled by the camera-permission overlay, pages/camera-permission-page.ts)
   */
  // showSettings(): void;
}
