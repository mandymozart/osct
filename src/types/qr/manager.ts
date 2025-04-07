/**
 * QR Manager State Interface
 */
export interface QRManagerState {
  isScanning: boolean;
  isInitialized: boolean;
  lastScannedCode?: string;
}

/**
 * QR Manager Interface
 */
export interface IQRManager {
  /**
   * Start QR scanning mode
   */
  startScanning(): void;

  /**
   * Stop QR scanning mode
   */
  stopScanning(): void;

  /**
   * Handle QR code scan result
   * @param qrCode The scanned QR code content
   */
  handleQRCodeScanned(qrCode: string): void;

  /**
   * Clean up QR scanner resources
   */
  cleanup(): void;
}
