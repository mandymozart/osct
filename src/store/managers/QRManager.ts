import { GameMode, IGame, Route } from "./../../types";

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
    // Initialize QR scanner component if not already done
    if (!this.isInitialized) {
      this.initializeQRScanner();
      this.isInitialized = true;
    }
    
    this.game.set({ mode: GameMode.QR });
  }

  /**
   * Stop QR scanning mode
   */
  public stopScanning(): void {
    this.game.set({ mode: GameMode.DEFAULT });
  }

  /**
   * Initialize the QR scanner component
   */
  private initializeQRScanner(): void {
    // Check if QR scanner already exists in the DOM
    this.qrScannerElement = document.querySelector('qr-scanner');
    
    // If not, create and append it
    if (!this.qrScannerElement) {
      this.qrScannerElement = document.createElement('qr-scanner');
      document.body.appendChild(this.qrScannerElement);
    }
    
    // Listen for QR code scanned events
    this.qrScannerElement.addEventListener('qr-code-scanned', (event: Event) => {
      // Cast to CustomEvent to access the detail property
      const customEvent = event as CustomEvent;
      const { data } = customEvent.detail;
      
      // Handle the scanned QR code
      this.handleQRCodeScanned(data);
    });
  }

  private getRouteFromUri(): Route | null {
    return null;
  }

  private getMode(value: string | null): GameMode {
    switch (value) {
      case "vr":
        return GameMode.VR;
      case "qr":
        return GameMode.QR;
      case "default":
      default:
        return GameMode.DEFAULT;
    }
  }

  /**
   * Handle QR code scan result
   */
  public handleQRCodeScanned(qrCode: string): void {
    console.log("QR code scanned", qrCode);
    if(qrCode === '<empty string>') { 
      console.warn('QR code not valid')
      return 

    }
      // TODO: 
    // TODO: Decode QR code
    // Assign action according to uri parameters.
    // mode = m
    // m = vr -> default
    // m = qr
    // state parameters can be set using uri params
    // ex: https://osct.buildingfictions.com/?&c=chapter1
    //     -> Load chapter1 into scene and activate
    // ex: https://osct.buildingfictions.com/tutorial?mode=vr
    //     -> Enter tutorial
    // ex: https://osct.buildingfictions.com?mode=qr !
    //     -> Start QR Scanning !This call is circular, prohibit for it is redundant!
    const url = new URL(qrCode);
    const mode = this.getMode(url.searchParams.get("m"));

    const chapter = url.searchParams.get("c");
    // TODO: split uri to get page by slug
    const page = this.getRouteFromUri();

    // TODO: complete the logic 
    if (!page) {
    }
    if(chapter){
      const confirmed = confirm(`Enter Chapter ${chapter}?`);
      if (confirmed) {
        this.game.chapters.switchChapter(chapter);
        this.stopScanning();
      }
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.stopScanning();
    
    // Remove QR scanner element if it exists
    if (this.qrScannerElement && this.qrScannerElement.parentNode) {
      this.qrScannerElement.removeEventListener('qr-code-scanned', (event: Event) => {
        const customEvent = event as CustomEvent;
        this.handleQRCodeScanned(customEvent.detail.data);
      });
      this.qrScannerElement.parentNode.removeChild(this.qrScannerElement);
      this.qrScannerElement = null;
    }
    
    this.isInitialized = false;
  }
}
