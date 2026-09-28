import {
  ArStatus,
  CameraPermissionStatus,
  ErrorInfo,
  GameMode,
  GameState,
  GameVersion,
  ICameraManager,
  ISpreadManager,
  IGame,
  IHistoryManager,
  IRouterManager,
  ITargetManager,
  LoadingState
} from "@/types";
import { uniqueId, createProgressRecord } from "@/utils";
import { getBook } from "@/utils/game-config";
import { BaseStore } from "./BaseStore";
import { CameraManager } from "./managers/CameraManager";
import { SpreadManager } from "./managers/SpreadManager";
import { HistoryManager } from "./managers/HistoryManager";
import { RouterManager } from "./managers/router/RouterManager";
import { TargetManager } from "./managers/TargetManager";

const initialState: GameState = {
  id: uniqueId(),
  mode: GameMode.IDLE,
  currentRoute: null,
  currentError: null,
  trackedTargets: [],
  currentSpread: null,
  progress: createProgressRecord(getBook().id), // replaced by the stored record in HistoryManager.load()
  loading: LoadingState.LOADING,
  arStatus: "idle",
  cameraPermission: CameraPermissionStatus.UNKNOWN
}

/**
 * Central app store (`GameState`): mode, route, error, tracked targets, spreads, reader progress
 * and loading / AR / camera status. Domain logic lives in the managers. Construction order
 * matters: spreads must exist before history, which restores the last spread.
 */
class Game extends BaseStore<GameState> implements IGame {
  public version: GameVersion = { version: __VITE_APP_VERSION__, timestamp: __VITE_BUILD_DATE__ } as GameVersion;

  public spreads: ISpreadManager;
  public targets: ITargetManager;
  public history: IHistoryManager;
  public router: IRouterManager;
  public camera: ICameraManager;

  /** Subscribers to `notifyError`, registered via `onError` */
  private errorListeners: Array<(error: ErrorInfo) => void> = [];

  constructor() {
    super(initialState);

    this.camera = new CameraManager(this);
    this.spreads = new SpreadManager(this);
    this.history = new HistoryManager(this);
    this.targets = new TargetManager(this);
    this.router = new RouterManager(this);
  }

  public finishLoading(): void {
    this.set({ loading: LoadingState.LOADED });
  }

  public startLoading(): void {
    this.set({ loading: LoadingState.LOADING });
  }

  public setLoadingState(state: LoadingState): void {
    this.set({ loading: state });
  }

  public setArStatus(status: ArStatus): void {
    if (this.state.arStatus !== status) this.set({ arStatus: status });
  }

  /** Shows the error / notice overlay, informs `onError` subscribers and logs the error. */
  public notifyError(error: ErrorInfo): void {
    const { code, msg } = error;
    this.router.showError(error);
    this.errorListeners.forEach((listener) => listener(error));
    console.error(`[Game] Error: ${msg} (${code})`);
  }

  /** Registers an error listener; returns its cleanup function. */
  public onError(listener: (error: ErrorInfo) => void): () => void {
    this.errorListeners.push(listener);

    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }
}

export const createGameStore = () => new Game() as unknown as IGame;
