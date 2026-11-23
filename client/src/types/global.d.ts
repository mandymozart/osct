import { IGame } from './game';
import type { IQRCodeStatic } from '../../../ui/landing/qrcode';

// Globals: the game store (debugging / console access) and the vendored QRCode library
declare global {
  interface Window {
    READER: IGame;
    QRCode: IQRCodeStatic;
  }
}

// Makes this file a module so `declare global` applies
export {};
