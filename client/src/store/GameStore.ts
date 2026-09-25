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
  spreads: {}, 
  progress: createProgressRecord(getBook().id), // loaded by the HistoryManager
  loading: LoadingState.LOADING,
  arStatus: "idle",
  cameraPermission: CameraPermissionStatus.UNKNOWN
}

/**
 * Game-specific store
 * Uses specialized managers for different concerns
 */
class Game extends BaseStore<GameState> implements IGame {
  public version: GameVersion = { version: __VITE_APP_VERSION__, timestamp: __VITE_BUILD_DATE__ } as GameVersion;

  // Managers
  public spreads: ISpreadManager;
  public targets: ITargetManager;
  public history: IHistoryManager;
  public router: IRouterManager;
  public camera: ICameraManager;

  /**
   * Notification and Error listeners
   *
   * Usage:
   * In a component or manager
   *
   * const cleanup = game.onError((error) => {
   *    console.error(`Error occurred: ${error.message}`);
   *    // Handle error in UI
   * });
   *
   * Later, when done
   *
   * cleanup();
   */
  private errorListeners: Array<(error: ErrorInfo) => void> = [];

  constructor() {
    super(initialState);

    this.camera = new CameraManager(this);
    this.spreads = new SpreadManager(this);
    this.history = new HistoryManager(this);
    this.targets = new TargetManager(this);
    this.router = new RouterManager(this);
  }

  /**
   * Signals that loading is complete
   */
  public finishLoading(): void {
    this.set({ loading: LoadingState.LOADED });

    // Hide the initial loader added to index.html
    if (typeof window !== 'undefined' && window.hideInitialLoader) {
      window.hideInitialLoader();
    }
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

  /**
   * Notify listeners about an error
   */
  public notifyError(error: ErrorInfo): void {
    const { code, msg } = error;
    this.router.showError(error);
    this.errorListeners.forEach((listener) => listener(error));
    console.error(`[Game] Error: ${msg} (${code})`);
  }

  /**
   * Add error listener
   */
  public onError(listener: (error: ErrorInfo) => void): () => void {
    this.errorListeners.push(listener);

    // Return cleanup function
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }
}

export const createGameStore = () => new Game() as unknown as IGame;
