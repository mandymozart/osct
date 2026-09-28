export enum CameraPermissionStatus {
  UNKNOWN = 'unknown',
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt',
  /** No camera API: insecure connection (http on a network address) or no camera support */
  UNAVAILABLE = 'unavailable',
  /**
   * Access granted, but the camera delivers no frames (happens on Android Chrome after another app used
   * the camera; only a browser restart recovers). Set by `<ar-bridge>` when the camera start times out.
   */
  NOT_RESPONDING = 'not-responding',
}

export interface CameraManagerState {
  cameraPermission: CameraPermissionStatus;
}

/** Tracks camera permission; the camera-permission overlay (pages/camera-permission-page.ts) explains recovery. */
export interface ICameraManager {
  /** Query the current permission; resolves true when granted */
  checkPermission(): Promise<boolean>;
  
  /** Prompt for camera access; resolves true when granted */
  requestAccess(): Promise<boolean>;

  /** Sets NOT_RESPONDING after the camera start timed out */
  reportNotResponding(): void;
}
