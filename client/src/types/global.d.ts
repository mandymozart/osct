import { IGame } from './game';
import { IQRCodeStatic } from './qr/qrcode';

// This extends the Window interface to include your BOOKGAME property
declare global {
  interface Window {
    BOOKGAME: IGame;
    QRCode: IQRCodeStatic;
  }
}

// This export is needed to make this file a module
export {};
