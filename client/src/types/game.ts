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
 * Game mode = global app state: decides whether the scene runs and which chrome is shown.
 * Set only through routes – each route declares its mode, `RouterManager.navigate` applies it
 * together with the route (RULES #2).
 * IDLE: home, tutorial – scene not running.
 * SCAN: scan HUD – scene + tracking run.
 * CONSULTATION: entries, about/info – scene paused.
 * VR: rarely used, left as it is.
 */
export enum GameMode {
  VR = "vr",
  SCAN = "scan",
  CONSULTATION = "consultation",
  IDLE = "idle",
}
