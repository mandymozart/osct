import { LoadableStore } from "./LoadableStore";
import { ChapterManager } from "./managers/ChapterManager";
import { HistoryManager } from "./managers/HistoryManager";
import { SceneManager } from "./managers/SceneManager";
import { TargetManager } from "./managers/TargetManager";
import {
  GameConfiguration,
  GameMode,
  GameState,
  IGame,
  ITutorialManager,
  IChapterManager,
  IRouterManager,
  ITargetManager,
  ISceneManager,
  IHistoryManager,
  ErrorInfo,
  IQRManager,
  LoadingState
} from "../types";
import { QRManager } from "./managers/QRManager";
import { RouterManager } from "./managers/router/RouterManager";
import { TutorialManager } from "./managers/TutorialManager";


/**
 * Game-specific store that manages chapter loading and target tracking
 * Uses specialized managers for different concerns
 */
export class Game extends LoadableStore implements IGame {
  public state: GameState;
  public configuration: GameConfiguration;

  // Specialized managers
  public scene: ISceneManager;
  public chapters: IChapterManager;
  public targets: ITargetManager;
  public history: IHistoryManager;
  public router: IRouterManager;
  public qr: IQRManager;
  public tutorial: ITutorialManager;

  constructor() {
    super();

    this.configuration = {
      version: null,
      chapters: [],
      router: null,
      tutorial: [],
    };

    this.state = {
      scene: null,
      mode: GameMode.DEFAULT,
      currentRoute: null,
      trackedTargets: [],
      currentChapter: null,
      chapters: {}, 
      currentTutorialStepId: null,
      tutorialSteps: {},
      history: [],
      configVersion: null,
      loading: LoadingState.INITIAL,
    };

    this.scene = new SceneManager(this);
    this.chapters = new ChapterManager(this);
    this.targets = new TargetManager(this);
    this.history = new HistoryManager(this);
    this.router = new RouterManager(this);
    this.qr = new QRManager(this);
    this.tutorial = new TutorialManager(this);
  }

  /**
   * Initialize the game store
   * // TODO: evaluate which managers should be initialized here
   */
  public initialize(): void {
    this.history.load();
  }

  
  /**
   * Error listeners
   *
   * Usage:
   * In a component or manager
   *
   * const cleanup = game.onError((error) => {
   *    console.log(`Error occurred: ${error.message}`);
   *    // Handle error in UI
   * });
   *
   * Later, when done
   *
   * cleanup();
   */
  private errorListeners: ((error: ErrorInfo) => void)[] = [];

  /**
   * Notify listeners about an error
   */
  public notifyError(error: ErrorInfo): void {
    const { code, msg } = error;
    console.log("Error occurred:", error);

    // Show error in error page
    this.router.showError(error);

    // Notify error listeners
    this.errorListeners.forEach((listener) => listener(error));

    // Log error for debugging
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
