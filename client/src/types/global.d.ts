import { IGame } from './game';

// This extends the Window interface to include your BOOKGAME property
declare global {
  interface Window {
    BOOKGAME: IGame;
    hideInitialLoader: () => void;
  }
}

// This export is needed to make this file a module
export {};
