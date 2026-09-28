import { CameraPermissionStatus, ICameraManager, IGame } from "@/types";

/**
 * Camera permission state (`cameraPermission`): queries the Permissions API, probes access with
 * progressively simpler constraints and reports unavailable / denied / not-responding cameras,
 * which the permission overlay reacts to.
 */
export class CameraManager implements ICameraManager {
  private game: IGame;
  
  constructor(game: IGame) {
    this.game = game;
  }
  
  private setPermissionStatus(status: CameraPermissionStatus): void {
    this.game.update(draft => {
      draft.cameraPermission = status;
    });
  }
  
  /** Camera API present: requires a secure context (https or localhost) and getUserMedia support */
  private get cameraAvailable(): boolean {
    return window.isSecureContext !== false && typeof navigator.mediaDevices?.getUserMedia === "function";
  }

  /** Resolves whether the camera may be used; requests access when the state is prompt / unknown. */
  public async checkPermission(): Promise<boolean> {
    if (!this.cameraAvailable) {
      this.setPermissionStatus(CameraPermissionStatus.UNAVAILABLE);
      return false;
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permissionResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
        
        const status = permissionResult.state as CameraPermissionStatus;
        this.setPermissionStatus(status);
        
        // Follow later changes, e.g. made in the browser settings
        permissionResult.addEventListener('change', () => {
          this.setPermissionStatus(permissionResult.state as CameraPermissionStatus);
        });
        
        if (status === CameraPermissionStatus.GRANTED) {
          return true;
        } else if (status === CameraPermissionStatus.DENIED) {
          return false;
        } else {
          return await this.requestAccess();
        }
      } else {
        // No Permissions API: probe by requesting the camera
        return await this.requestAccess();
      }
    } catch (error) {
      console.warn('[Camera Manager] Warning checking camera permission:', error);
      this.setPermissionStatus(CameraPermissionStatus.DENIED);
      return false;
    }
  }
  
  /** Access was granted but the AR engine reports that the camera stream does not start. */
  public reportNotResponding(): void {
    this.setPermissionStatus(CameraPermissionStatus.NOT_RESPONDING);
  }

  /**
   * Probe camera access via getUserMedia; the stream is only a probe and is stopped immediately.
   * Sets GRANTED or DENIED.
   */
  public async requestAccess(): Promise<boolean> {
    if (!this.cameraAvailable) {
      console.warn('[Camera Manager] No camera API – the app needs https (or localhost) for the camera');
      this.setPermissionStatus(CameraPermissionStatus.UNAVAILABLE);
      return false;
    }
    try {
      this.setPermissionStatus(CameraPermissionStatus.PROMPT);
      
      // Ask the rear camera for about 75 % of the screen resolution
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;

      const targetWidth = Math.round(screenWidth * 0.75);
      const targetHeight = Math.round(screenHeight * 0.75);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: targetWidth },
            height: { ideal: targetHeight }
          } 
        });

        stream.getTracks().forEach(track => track.stop());
        
        this.setPermissionStatus(CameraPermissionStatus.GRANTED);
        return true;
      } catch (constraintError) {
        // iOS Safari often rejects resolution constraints: retry with facingMode only
        if (constraintError instanceof OverconstrainedError || 
            (constraintError as any)?.name === 'OverconstrainedError') {
          console.warn('[Camera Manager] Detailed constraints failed, trying with simpler constraints');

          const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
          });
          
          fallbackStream.getTracks().forEach(track => track.stop());
          this.setPermissionStatus(CameraPermissionStatus.GRANTED);
          return true;
        }
        
        // Any other error: last attempt with the plainest request
        console.warn('[Camera Manager] Trying with original simple constraints');
        const legacyStream = await navigator.mediaDevices.getUserMedia({ video: true });
        legacyStream.getTracks().forEach(track => track.stop());
        this.setPermissionStatus(CameraPermissionStatus.GRANTED);
        return true;
      }
    } catch (error) {
      console.warn('[Camera Manager] Requesting access failed', error);
      
      // DENIED shows the camera-permission overlay
      this.setPermissionStatus(CameraPermissionStatus.DENIED);
    
      return false;
    }
  }
}
