import type { CameraManagerState, ICameraManager } from "./camera";
import type { ErrorInfo, ErrorListener } from "./errors";
import type { HistoryManagerState, IHistoryManager } from "./history";
import type { IRouterManager, RouterManagerState } from "./router";
import type { ArStatus } from "./scene";
import type { ISpreadManager, SpreadManagerState } from "./spreads";
import type { IBaseStore } from "./store";
import type { ITargetManager, TargetManagerState } from "./targets";
import type { LoadingState } from "./common";

export interface IGame extends IBaseStore<GameState> {
  version: GameVersion; // the app build (content: getConfigVersion())
  state: GameState;
  spreads: ISpreadManager;
  router: IRouterManager;
  targets: ITargetManager;
  history: IHistoryManager;
  camera: ICameraManager;

  startLoading(): void;
  finishLoading(): void;
  /** Called by `<ar-bridge>` whenever the AR scene status changes */
  setArStatus(status: ArStatus): void;
  notifyError(error: ErrorInfo): void;
  /** Registers an error listener; returns the function that removes it */
  onError(listener: ErrorListener): () => void;
}

export interface GameState
  extends SpreadManagerState,
  TargetManagerState,
  HistoryManagerState,
  RouterManagerState,
  CameraManagerState {
  id: string;
  loading: LoadingState;
  mode: GameMode;
  /** What the AR scene is doing (reported by `<ar-bridge>`) */
  arStatus: ArStatus;
}

export interface GameVersion {
  version: string;
  timestamp: string;
}

/**
 * UI context: which chrome is shown and what Mark the Page does. Set only through routes – each route
 * declares its mode and `RouterManager.navigate` applies both together (RULES #2). The scene state is
 * derived from it (`ar-bridges/utils/scene-state.ts`).
 * IDLE: home, onboarding, tutorial – no AR chrome.
 * SCAN: Mark (scan), counter, spread menu; scene running.
 * CONSULTATION: Mark (consultation), entries, info; scene paused underneath.
 */
export enum GameMode {
  SCAN = "scan",
  CONSULTATION = "consultation",
  IDLE = "idle",
}
