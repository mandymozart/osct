export interface ISpreadManager {
  switchSpread(id: string): void;
}

export interface SpreadManagerState {
  currentSpread: string | null;
}
