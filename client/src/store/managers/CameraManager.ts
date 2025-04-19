import { CameraPermissionStatus, ICameraManager, IGame } from "@/types";

/**
 * Manages camera permission state and operations
 */
export class CameraManager implements ICameraManager {
  private game: IGame;
  private permissionChangeListeners: ((status: CameraPermissionStatus) => void)[] = [];
  
  constructor(game: IGame) {
    this.game = game;
  }
  
  /**
   * Get current permission status
   */
  get permissionStatus(): CameraPermissionStatus {
    return this.game.state.cameraPermission;
  }
  
  /**
   * Set permission status and notify listeners
   */
  private setPermissionStatus(status: CameraPermissionStatus): void {
    this.game.set({ cameraPermission: status });
    this.notifyPermissionListeners(status);
  }
  
  /**
   * Notify permission change listeners
   */
  private notifyPermissionListeners(status: CameraPermissionStatus): void {
    this.permissionChangeListeners.forEach(listener => listener(status));
  }
  
  /**
   * Add permission status change listener
   */
  public onPermissionChange(listener: (status: CameraPermissionStatus) => void): () => void {
    this.permissionChangeListeners.push(listener);
    
    // Return cleanup function
    return () => {
      const index = this.permissionChangeListeners.indexOf(listener);
      if (index > -1) {
        this.permissionChangeListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Check and handle camera permission
   */
  public async checkPermission(): Promise<boolean> {
    try {
      // First check if the permissions API is available
      if (navigator.permissions && navigator.permissions.query) {
        const permissionResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
        
        const status = permissionResult.state as CameraPermissionStatus;
        this.setPermissionStatus(status);
        
        // Set up a listener for permission changes
        permissionResult.addEventListener('change', () => {
          this.setPermissionStatus(permissionResult.state as CameraPermissionStatus);
        });
        
        // Handle the current permission state
        if (status === CameraPermissionStatus.GRANTED) {
          return true;
        } else if (status === CameraPermissionStatus.DENIED) {
          return false;
        } else {
          // For prompt or unknown status, request access
          return await this.requestAccess();
        }
      } else {
        // Fallback for browsers without permissions API: try to access the camera directly
        return await this.requestAccess();
      }
    } catch (error) {
      console.warn('[Camera Manager] Warning checking camera permission:', error);
      this.setPermissionStatus(CameraPermissionStatus.DENIED);
      return false;
    }
  }
  
  /**
   * Request camera access explicitly
   */
  public async requestAccess(): Promise<boolean> {
    try {
      this.setPermissionStatus(CameraPermissionStatus.PROMPT);
      
      // Get device dimensions for adaptive constraints
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;
      
      // Calculate reasonable camera resolution based on device
      // Using 75% of the screen dimensions as a reasonable target
      const targetWidth = Math.round(screenWidth * 0.75);
      const targetHeight = Math.round(screenHeight * 0.75);
      
      // Outer try/catch for progressive fallback
      try {
        // First try with adaptive constraints based on device dimensions
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: targetWidth },
            height: { ideal: targetHeight }
          } 
        });
        
        // Clean up the stream we just requested
        stream.getTracks().forEach(track => track.stop());
        
        this.setPermissionStatus(CameraPermissionStatus.GRANTED);
        return true;
      } catch (constraintError) {
        // Only catch OverconstrainedError here - this happens often on iOS Safari
        if (constraintError instanceof OverconstrainedError || 
            (constraintError as any)?.name === 'OverconstrainedError') {
          console.warn('[Camera Manager] Detailed constraints failed, trying with simpler constraints');
          
          // Try with minimal constraints for iOS compatibility
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
          });
          
          fallbackStream.getTracks().forEach(track => track.stop());
          this.setPermissionStatus(CameraPermissionStatus.GRANTED);
          return true;
        }
        
        // If it's not an OverconstrainedError, try the original simple approach
        // This maintains compatibility with browsers that worked before
        console.warn('[Camera Manager] Trying with original simple constraints');
        const legacyStream = await navigator.mediaDevices.getUserMedia({ video: true });
        legacyStream.getTracks().forEach(track => track.stop());
        this.setPermissionStatus(CameraPermissionStatus.GRANTED);
        return true;
      }
    } catch (error) {
      console.warn('[Camera Manager] Requesting access failed', error);
      
      // Set the permission status to DENIED - this will trigger the overlay
      this.setPermissionStatus(CameraPermissionStatus.DENIED);
    
      return false;
    }
  }
}
