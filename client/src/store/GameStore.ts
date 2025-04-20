import { LoadableStore } from "./LoadableStore";
import { ChapterManager } from "./managers/ChapterManager";
import { HistoryManager } from "./managers/HistoryManager";
import { SceneManager } from "./managers/SceneManager";
import { TargetManager } from "./managers/TargetManager";
import {
  GameMode,
  GameState,
  IGame,
  IChapterManager,
  IRouterManager,
  ITargetManager,
  ISceneManager,
  IHistoryManager,
  ErrorInfo,
  IQRManager,
  LoadingState,
  GameVersion,
  ConfigurationVersion,
  CameraPermissionStatus,
  ICameraManager
} from "../types";
import { QRManager } from "./managers/QRManager";
import { RouterManager } from "./managers/router/RouterManager";
import { uniqueId } from "@/utils";
import { version as configVersion } from "@/game.config.json";
import { CameraManager } from "./managers/CameraManager";

/**
 * Game-specific store that manages chapter loading and target tracking
 * Uses specialized managers for different concerns
 */
class Game extends LoadableStore implements IGame {
  public state: GameState;
  public version: GameVersion = { version: __VITE_APP_VERSION__, timestamp: __VITE_BUILD_DATE__ } as GameVersion;

  public scene: ISceneManager;
  public chapters: IChapterManager;
  public targets: ITargetManager;
  public history: IHistoryManager;
  public router: IRouterManager;
  public qr: IQRManager;
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
    super();

    this.state = {
      id: uniqueId(),
      scene: null,
      mode: GameMode.IDLE,
      currentRoute: null,
      currentError: null,
      trackedTargets: [],
      currentChapter: null,
      chapters: {},
      history: [],
      configVersion: configVersion as unknown as ConfigurationVersion,
      loading: LoadingState.LOADING,
      cameraPermission: CameraPermissionStatus.UNKNOWN,
    };

    this.scene = new SceneManager(this);
    this.chapters = new ChapterManager(this);
    this.targets = new TargetManager(this);
    this.history = new HistoryManager(this);
    this.router = new RouterManager(this);
    this.qr = new QRManager(this);
    this.camera = new CameraManager(this);
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
