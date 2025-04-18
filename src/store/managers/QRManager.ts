import { PageRoute, Pages } from "@/types/router";
import { router } from "@/router";
import { IGame, GameMode } from "@/types/game";

/**
 * Manages QR code scanning functionality
 */
export class QRManager {
  private game: IGame;
  private isInitialized: boolean = false;
  private qrScannerElement: HTMLElement | null = null;

  constructor(game: IGame) {
    this.game = game;
    this.handleQRCodeScanned = this.handleQRCodeScanned.bind(this);
  }

  /**
   * Start QR scanning mode
   */
  public startScanning(): void {
    // Initialize QR scanner if needed
    if (!this.isInitialized) {
      this.initializeQRScanner();
    }

    // Switch to QR mode
    this.game.set({ mode: GameMode.QR });

    // Show QR scanner
    if (this.qrScannerElement) {
      this.qrScannerElement.style.display = 'block';
    }
  }

  /**
   * Stop QR scanning mode
   */
  public stopScanning(): void {
    // Switch back to default mode
    this.game.set({ mode: GameMode.DEFAULT });

    // Hide QR scanner
    if (this.qrScannerElement) {
      this.qrScannerElement.style.display = 'none';
    }
  }

  /**
   * Initialize the QR scanner component
   */
  private initializeQRScanner(): void {
    // Create QR scanner element if it doesn't exist
    // TODO: remove initialisation for it can create conflicts.
    // refactor so dom listeners and manipulation is handled by qr-scanner
    // itself
    if (!document.querySelector('qr-scanner')) {
      this.qrScannerElement = document.createElement('qr-scanner');
      document.body.appendChild(this.qrScannerElement);
    } else {
      this.qrScannerElement = document.querySelector('qr-scanner');
    }

    // Set up event listener for QR code scanned
    if (this.qrScannerElement) {
      this.qrScannerElement.addEventListener('qr-code-scanned', 
        ((e: Event) => {
          const customEvent = e as CustomEvent;
          this.handleQRCodeScanned(customEvent.detail.qrCode);
        }) as EventListener);
    }

    this.isInitialized = true;
  }

  public getRouteFromUri(uri: string): PageRoute {
    // Extract the route path from the URI
    // For this simple example, we'll assume the URI format is like "osct://chapter/chapter1"
    const parts = uri.split('://');
    if (parts.length !== 2 || parts[0] !== 'osct') {
      throw new Error('Invalid QR code URI format');
    }

    const path = parts[1]; // e.g., "chapter/chapter1"
    const pathParts = path.split('/');

    // Check if we have enough parts to extract page and chapter
    if (pathParts.length < 1) {
      throw new Error('Invalid QR code path');
    }

    const page = pathParts[0]; // e.g., "chapter"
    
    // Look up the corresponding Pages enum value
    let pageEnum: Pages | undefined;
    Object.entries(Pages).forEach(([key, value]) => {
      if (value.toLowerCase() === page.toLowerCase()) {
        pageEnum = value as Pages;
      }
    });

    if (!pageEnum) {
      throw new Error(`Unknown page: ${page}`);
    }

    return { page: pageEnum } as PageRoute;
  }

  /**
   * Handle QR code scan result
   */
  public handleQRCodeScanned(qrCode: string): void {
    try {
      console.log('QR Code scanned:', qrCode);
      
      // Parse the QR code as a URI
      // Example format: osct://chapter/chapter1
      const parts = qrCode.split('://');
      if (parts.length < 2 || parts[0] !== 'osct') {
        throw new Error('Invalid QR code format');
      }
      
      const path = parts[1];
      const pathParts = path.split('/');
      const page = pathParts[0];
      const chapter = pathParts.length > 1 ? pathParts[1] : undefined;
      
      const route = this.getRouteFromUri(qrCode);

      // Handle chapter-specific navigation
      if (route.page === Pages.CHAPTER && chapter) {
        const confirmed = confirm(`Enter Chapter ${chapter}?`);
        if (confirmed) {
          this.game.chapters.switchChapter(chapter);
          this.stopScanning();
          this.game.router.navigate('/chapter', { key: 'chapterId', value: chapter });
        }
      } else {
        // For other pages, just navigate to them
        this.game.router.navigate(route.page);
        this.stopScanning();
      }
    } catch (error) {
      console.warn('Invalid QR code URL');
      this.game.set({ mode: GameMode.DEFAULT })
      this.game.router.close();
      this.stopScanning();
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.qrScannerElement) {
      this.qrScannerElement.removeEventListener('qr-code-scanned', 
        ((e: Event) => {
          const customEvent = e as CustomEvent;
          this.handleQRCodeScanned(customEvent.detail.qrCode);
        }) as EventListener);
    }
  }
}
