import { GameStore, GameMode, Route } from "../types";
import { initQRScanner } from "../../lib/qrScanner";
import { URLSearchParams } from "url";

export class QRManager {
  private store: GameStore;
  private isInitialized: boolean = false;

  constructor(store: GameStore) {
    this.store = store;
    this.handleQRCodeScanned = this.handleQRCodeScanned.bind(this);
  }

  /**
   * Start QR scanning mode
   */
  public startScanning(): void {
    if (!this.isInitialized) {
      initQRScanner(this.handleQRCodeScanned);
      this.isInitialized = true;
    }
    this.store.set({ mode: GameMode.QR });
  }

  /**
   * Stop QR scanning mode
   */
  public stopScanning(): void {
    this.store.set({ mode: GameMode.DEFAULT });
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
  private handleQRCodeScanned(qrCode: string): void {
    console.log("QR code scanned", qrCode);
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
        this.store.switchChapter(chapter);
        this.stopScanning();
      }
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.stopScanning();
    this.isInitialized = false;
  }
}
