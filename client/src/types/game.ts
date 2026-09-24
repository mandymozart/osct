import {
  CameraManagerState,
  ConfigurationVersion,
  SpreadManagerState,
  ErrorInfo,
  ErrorListener,
  HistoryManagerState,
  IBaseStore,
  ICameraManager,
  ISpreadManager,
  IHistoryManager,
  IRouterManager,
  ITargetManager,
  LoadingState,
  RouterManagerState,
  TargetManagerState
} from "@/types";


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
}

export interface GameVersion {
  version: string;
  timestamp: string;
}

/**
 * Game mode = UI context (from the design): which chrome is shown and what Mark the Page does.
 * Set only through routes – each route declares its mode, `RouterManager.navigate` applies it
 * together with the route (RULES #2). The scene state follows from it (`utils/scene-state.ts`).
 * IDLE: home, onboarding/tutorial – no AR chrome.
 * SCAN: scan mode – Mark (scan), counter, spread menu; scene running.
 * CONSULTATION: consultation mode – Mark (consultation), entries, info; scene paused underneath.
 */
export enum GameMode {
  SCAN = "scan",
  CONSULTATION = "consultation",
  IDLE = "idle",
}
