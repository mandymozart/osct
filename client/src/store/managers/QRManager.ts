import { IGame, GameMode, ErrorCode, ErrorInfo } from "@/types";
import { IQRManager } from "@/types/qr";
import { Pages } from "@/types/router";
import { createChapterRoute, parseQRCodeURL } from "@/utils/qr";

/**
 * Manages QR scanning game state
 */
export class QRManager implements IQRManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
    this.handleQRCodeScanned = this.handleQRCodeScanned.bind(this);
    this.handleTryAgain = this.handleTryAgain.bind(this);
  }

  /**
   * Start QR scanning mode by setting game mode to QR
   */
  public startScanning(): void {
    // Switch to QR mode and clear any previous errors
    this.game.update(draft => {
      draft.mode = GameMode.QR;
      draft.currentRoute = { page: Pages.CHAPTER, slug: "/chapter" };
      draft.currentError = null;
    });
  }

  /**
   * Stop QR scanning mode by switching back to default mode
   */
  public stopScanning(): void {
    // Switch back to default mode
    this.game.update(draft => {
      draft.mode = GameMode.DEFAULT;
    });
  }

  /**
   * Error handler to try scanning again
   */
  private handleTryAgain(): void {
    // Clear error and stay in QR mode
    this.startScanning();
  }

  /**
   * Handle QR code data after scanning
   * This method will be called by the QRScanner component
   */
  public handleQRCodeScanned(data: string): void {
    try {
      console.log('[QR Manager] QR code scanned:', data);
      
      // Handle URLs with http/https
      if (data.startsWith('http://') || data.startsWith('https://')) {
        // Parse URL to extract chapter information
        const chapterId = parseQRCodeURL(data);
        console.log('[QR Manager] Chapter ID:', chapterId);
        if (chapterId) {
          // Navigate to the chapter
          this.game.chapters.switchChapter(chapterId);
          const route = createChapterRoute(chapterId);
          this.game.router.navigate(`/${route.slug}`, route.param);
          this.stopScanning();
        } else {
          // Notify error for invalid chapter code
          this.notifyError({
            code: ErrorCode.INVALID_QR_CODE,
            msg: "The QR code does not contain a valid chapter code",
            type: "warning",
            details: { scannedData: data }
          });
        }
      } else {
        // Notify error for unrecognized format
        this.notifyError({
          code: ErrorCode.INVALID_QR_URL,
          msg: "Unrecognized QR code format, expecting a URL",
          type: "warning",
          details: { scannedData: data }
        });
      }
    } catch (error) {
      // Notify error for any scanning issues
      this.notifyError({
        code: ErrorCode.FAILED_TO_SCAN_QR,
        msg: "Failed to process QR code data",
        type: "warning",
        details: error
      });
    }
  }
  
  /**
   * Display error notification with try again option
   */
  private notifyError(errorInfo: Omit<ErrorInfo, "action">): void {
    // Add try again action to the error
    const error: ErrorInfo = {
      ...errorInfo,
      action: {
        text: "Try Again",
        callback: this.handleTryAgain
      }
    };
    
    // Update game state with error
    this.game.update(draft => {
      draft.mode = GameMode.DEFAULT;
      draft.currentError = error;
    });
  }
  
  /**
   * Clean up QR scanner resources
   */
  public cleanup(): void {
    // No DOM cleanup needed anymore, state is cleaned up by stopScanning
    this.stopScanning();
  }
}
