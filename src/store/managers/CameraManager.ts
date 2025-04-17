import { CameraPermissionStatus, ICameraManager, IGame, ErrorCode } from "@/types";

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
      console.error('[Camera Manager] Error checking camera permission:', error);
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
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Clean up the stream we just requested
      stream.getTracks().forEach(track => track.stop());
      
      this.setPermissionStatus(CameraPermissionStatus.GRANTED);
      return true;
    } catch (error) {
      console.error('[Camera Manager] Error requesting camera:', error);
      
      // First set the permission status to DENIED - this will trigger the overlay
      this.setPermissionStatus(CameraPermissionStatus.DENIED);
      
      // Then notify game about the error with action button for settings
      this.game.notifyError({
        code: ErrorCode.CAMERA_PERMISSION_DENIED,
        msg: "Camera access was denied. Please enable camera permissions to use AR features.",
        action: {
          text: "Open Settings", 
          callback: () => {
            console.log("[Camera Manager] Showing settings instructions");
            this.showSettings();
            // Keep the camera permission overlay visible even after closing the error
            // Don't clear the camera permission status
            this.game.router.close();
          }
        }
      });
      
      return false;
    }
  }
  
  /**
   * Show instructions for enabling camera access in browser settings
   * Different browsers have different ways to manage permissions
   */
  public showSettings(): void {
    const browser = this.detectBrowser();
    let instructions = '';
    
    switch (browser) {
      case 'chrome':
        instructions = 'To enable camera access in Chrome:\n\n' +
          '1. Click the lock icon (🔒) in the address bar\n' +
          '2. Select "Site settings"\n' +
          '3. Allow camera permissions\n' +
          '4. Refresh the page';
        break;
      case 'firefox':
        instructions = 'To enable camera access in Firefox:\n\n' +
          '1. Click the lock icon (🔒) in the address bar\n' +
          '2. Clear the current setting\n' +
          '3. Refresh the page and allow access when prompted';
        break;
      case 'safari':
        instructions = 'To enable camera access in Safari:\n\n' +
          '1. Open Safari Preferences\n' +
          '2. Go to Websites > Camera\n' +
          '3. Find this website and select "Allow"\n' +
          '4. Refresh the page';
        break;
      default:
        instructions = 'To enable camera access:\n\n' +
          '1. Check your browser settings for camera permissions\n' +
          '2. Allow this site to use your camera\n' +
          '3. Refresh the page';
    }
    
    alert(instructions);
  }
  
  /**
   * Simple browser detection for tailoring instructions
   */
  private detectBrowser(): string {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.indexOf('chrome') > -1) return 'chrome';
    if (userAgent.indexOf('firefox') > -1) return 'firefox'; 
    if (userAgent.indexOf('safari') > -1) return 'safari';
    
    return 'unknown';
  }
}
