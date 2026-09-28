import { IGame } from './game';
import { IQRCodeStatic } from './qr/qrcode';

// Globals: the game store (debugging / console access) and the vendored QRCode library
declare global {
  interface Window {
    BOOKGAME: IGame;
    QRCode: IQRCodeStatic;
  }
}

// Makes this file a module so `declare global` applies
export {};
