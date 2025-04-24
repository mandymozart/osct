import { version as configVersion } from "@/game.config.json";
import {
  CameraPermissionStatus,
  ConfigurationVersion,
  ErrorInfo,
  GameMode,
  GameState,
  GameVersion,
  IAssetManager,
  ICameraManager,
  IChapterManager,
  IEntityManager,
  IGame,
  IHistoryManager,
  IQRManager,
  IRouterManager,
  ITargetManager,
  LoadingState
} from "@/types";
import { uniqueId } from "@/utils";
import { BaseStore } from "./BaseStore";
import { AssetManager } from "./managers/AssetManager";
import { CameraManager } from "./managers/CameraManager";
import { ChapterManager } from "./managers/ChapterManager";
import { EntityManager } from "./managers/EntityManager";
import { HistoryManager } from "./managers/HistoryManager";
import { QRManager } from "./managers/QRManager";
import { RouterManager } from "./managers/router/RouterManager";
import { TargetManager } from "./managers/TargetManager";

const initialState: GameState = {
  id: uniqueId(),
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
  assets: {},
  entities: {}
}

/**
 * Game-specific store
 * Uses specialized managers for different concerns
 */
class Game extends BaseStore<GameState> implements IGame {
  public version: GameVersion = { version: __VITE_APP_VERSION__, timestamp: __VITE_BUILD_DATE__ } as GameVersion;

  // Managers
  public chapters: IChapterManager;
  public targets: ITargetManager;
  public history: IHistoryManager;
  public router: IRouterManager;
  public qr: IQRManager;
  public camera: ICameraManager;
  public assets: IAssetManager;
  public entities: IEntityManager;

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

    this.assets = new AssetManager(this);
    this.camera = new CameraManager(this);
    this.chapters = new ChapterManager(this);
    this.entities = new EntityManager(this);
    this.history = new HistoryManager(this);
    this.targets = new TargetManager(this);
    this.qr = new QRManager(this);
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
