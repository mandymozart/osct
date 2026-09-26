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
  
  /**
   * Show instructions for enabling camera access in browser settings
   * (Responsibility handled by the camera-permission overlay, pages/camera-permission-page.ts)
   */
  // showSettings(): void;
}
