import {
  CameraManagerState,
  SpreadData,
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
  TargetManagerState,
  TutorialStepData
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

export interface GameConfiguration {
  version: ConfigurationVersion;
  initialSpreadId: string;
  spreads: readonly SpreadData[];
  tutorial: readonly TutorialStepData[];
}

export interface ConfigurationVersion {
  version: string;
  timestamp: string;
}
export interface GameVersion {
  version: string;
  timestamp: string;
}

/**
 * Game mode lets us know which state the game is in.
 * VR: User is in VR mode (This one is rarely used)
 * DEFAULT: User is in default mode (This is the most common mode)
 */
export enum GameMode {
  VR = "vr",
  DEFAULT = "default",
  IDLE = "idle",
}
