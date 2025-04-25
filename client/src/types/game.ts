import {
  CameraManagerState,
  ChapterData,
  ChapterManagerState,
  ErrorInfo,
  ErrorListener,
  HistoryManagerState,
  IBaseStore,
  ICameraManager,
  IChapterManager,
  IHistoryManager,
  IQRManager,
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
  chapters: IChapterManager;
  router: IRouterManager;
  targets: ITargetManager;
  qr: IQRManager;
  history: IHistoryManager;
  camera: ICameraManager;

  startLoading(): void;
  finishLoading(): void;
  setLoadingState(state: LoadingState): void;
  notifyError(error: ErrorInfo): void;
  onError(listener: ErrorListener): void;
}

export interface GameState
  extends ChapterManagerState,
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
  initialChapterId: string;
  chapters: readonly ChapterData[];
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
 * QR: User is in QR mode (Only needed when scanning QR codes)
 * DEFAULT: User is in default mode (This is the most common mode)
 */
export enum GameMode {
  VR = "vr",
  QR = "qr",
  DEFAULT = "default",
  IDLE = "idle",
}
