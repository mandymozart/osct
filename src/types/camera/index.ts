/**
 * Camera permission status enumeration
 */
export enum CameraPermissionStatus {
  UNKNOWN = 'unknown',
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt',
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
   * Current permission status
   */
  permissionStatus: CameraPermissionStatus;
  
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
   */
  showSettings(): void;
  
  /**
   * Add permission status change listener
   * @param listener Function to call when permission status changes
   * @returns Cleanup function to remove listener
   */
  onPermissionChange(listener: (status: CameraPermissionStatus) => void): () => void;
}
