import { GameMode, QRScanEvent } from "./../../types";

/**
 * QR Scanner Component Interface
 */
export interface IQRScanner extends HTMLElement {
  /**
   * Start the camera and begin QR scanning
   */
  startCamera(): Promise<void>; // TODO: made can be private

  /**
   * Stop the camera and QR scanning
   */
  stopCamera(): void; // TODO: made can be private

}