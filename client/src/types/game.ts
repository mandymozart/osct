import { CameraManagerState, ICameraManager } from "./camera";
import { ErrorInfo, ErrorListener } from "./errors";
import { ConfigurationVersion } from "./game-config";
import { HistoryManagerState, IHistoryManager } from "./history";
import { IRouterManager, RouterManagerState } from "./router";
import { ArStatus } from "./scene";
import { ISpreadManager, SpreadManagerState } from "./spreads";
import { IBaseStore } from "./store";
import { ITargetManager, TargetManagerState } from "./targets";
import { LoadingState } from "./common";

export interface IGame extends IBaseStore<GameState> {
  version: ConfigurationVersion; // History and Game version have to match. 
  state: GameState;
  spreads: ISpreadManager;
  router: IRouterManager;
  targets: ITargetManager;
  history: IHistoryManager;
  camera: ICameraManager;

  startLoading(): void;
  finishLoading(): void;
  setLoadingState(state: LoadingState): void;
  /** Reported by the AR bridge (Phase 6) */
  setArStatus(status: ArStatus): void;
  notifyError(error: ErrorInfo): void;
  onError(listener: ErrorListener): void;
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
 * Game mode = UI context (from the design): which chrome is shown and what Mark the Page does.
 * Set only through routes – each route declares its mode, `RouterManager.navigate` applies it
 * together with the route (RULES #2). The scene state follows from it (`ar-bridges/utils/scene-state.ts`).
 * IDLE: home, onboarding/tutorial – no AR chrome.
 * SCAN: scan mode – Mark (scan), counter, spread menu; scene running.
 * CONSULTATION: consultation mode – Mark (consultation), entries, info; scene paused underneath.
 */
export enum GameMode {
  SCAN = "scan",
  CONSULTATION = "consultation",
  IDLE = "idle",
}
