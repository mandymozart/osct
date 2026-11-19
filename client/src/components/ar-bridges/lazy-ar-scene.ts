import { type ArSceneEvents, type ArStatus, type EntityData, ErrorCode, type IArScene, type PassData, type SceneInspection, ArState } from "@/types";
import { Emitter } from "@engine/utils/emitter";

type ArModule = typeof import("./ar");

let arModule: Promise<ArModule> | null = null;
/** The AR chunk once it has loaded (the scene's runtime lives in it) */
let loadedModule: ArModule | null = null;

/** Every scene event, forwarded from the real scene (a record over the event type: a new event can't be left out) */
const AR_EVENTS = Object.keys({
  status: true,
  targetFound: true,
  targetLost: true,
  targetTapped: true,
  ready: true,
  sceneSeen: true,
  scanning: true,
  subtitle: true,
} satisfies Record<keyof ArSceneEvents, true>) as Array<keyof ArSceneEvents>;

/**
 * Load the AR chunk (three.js and the scene; the 8th Wall engine's own files load with the first start).
 * Nothing imports `./ar` statically, so the first paint never waits for it. Retries after a failed load
 * (offline).
 */
export const loadArModule = (): Promise<ArModule> => {
  if (!arModule) {
    arModule = import("./ar").then(module => (loadedModule = module)).catch(error => {
      arModule = null;
      throw error;
    });
  }
  return arModule;
};

/**
 * The book's variables in every scope the scene's runtime keeps – scene, stage, session and book (`allVars()`, the
 * book scope read from the reader's progress) – for the entry texts (`{hasKey}`); null while the AR chunk has not loaded
 */
export const sceneVariables = (): ReturnType<ArModule["allVars"]> | null => loadedModule?.allVars() ?? null;

/**
 * The bridge's `IArScene`: records the requested scene and state and hands them to the real `ArScene`
 * once its chunk is loaded – on the first RUNNING request, or earlier via `warmUp()`. Until then it
 * reports `idle`, and `loading` while the chunk loads for a start.
 */
export class LazyArScene implements IArScene {
  private emitter = new Emitter<ArSceneEvents>();
  private arScene: IArScene | null = null;
  private creating: Promise<IArScene> | null = null;
  private wantedScene: string | null = null;
  private wantedState: ArState = ArState.STOPPED;
  private disposed = false;

  private lastStatus: ArStatus = "idle";

  constructor(private container: HTMLElement) {
    this.emitter.on("status", status => (this.lastStatus = status));
  }

  get status(): ArStatus {
    return this.arScene?.status ?? this.lastStatus;
  }

  get sceneId(): string | null {
    return this.arScene?.sceneId ?? null;
  }

  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]): () => void {
    return this.emitter.on(event, listener);
  }

  /**
   * Fetch and evaluate the AR chunk and the tracking engine without building anything (no WebGL, no camera).
   * Resolves false when the AR chunk itself could not be loaded (the engine's files only log).
   */
  warmUp(): Promise<boolean> {
    return loadArModule().then(
      ar => ar.prefetchXr8().then(() => true, error => {
        console.warn("[ArScene] Could not preload the tracking engine:", error);
        return true;
      }),
      error => {
        console.warn("[ArScene] Could not preload AR:", error);
        return false;
      },
    );
  }

  async load(sceneId: string): Promise<void> {
    this.wantedScene = sceneId;
    if (this.arScene) return this.arScene.load(sceneId);
  }

  async setState(state: ArState): Promise<void> {
    this.wantedState = state;
    if (this.arScene) return this.arScene.setState(state);
    if (state !== ArState.RUNNING) return;
    try {
      const arScene = await this.create();
      if (this.disposed) return;
      // Apply the latest requests – they may have changed while the chunk loaded
      if (this.wantedScene) void arScene.load(this.wantedScene);
      await arScene.setState(this.wantedState);
    } catch (error) {
      console.error("[ArScene] AR could not be loaded:", error);
      this.emitter.emit("status", "error", { code: ErrorCode.AR_LOAD_FAILED, message: error instanceof Error ? error.message : String(error) });
    }
  }

  celebrate(targetId: string): void {
    this.arScene?.celebrate(targetId);
  }

  flyCard(targetId: string, card: { front: string; reveal?: string; back?: string }): Promise<boolean> {
    return this.arScene?.flyCard(targetId, card) ?? Promise.resolve(false);
  }

  async refresh(): Promise<void> {
    await this.arScene?.refresh();
  }

  overrideEntity(targetId: string, entity: EntityData | null): void {
    this.arScene?.overrideEntity(targetId, entity);
  }

  overridePasses(passes: PassData[] | null): void {
    this.arScene?.overridePasses(passes);
  }

  setPostProcessing(enabled: boolean): void {
    this.arScene?.setPostProcessing(enabled);
  }

  sampleColor(x: number, y: number): string | null {
    return this.arScene?.sampleColor(x, y) ?? null;
  }

  inspect(): SceneInspection | null {
    return this.arScene?.inspect() ?? null;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.arScene?.dispose();
  }

  private create(): Promise<IArScene> {
    if (!this.creating) {
      this.emitter.emit("status", "loading");
      this.creating = loadArModule().then(({ createReaderScene }) => {
        const arScene = createReaderScene(this.container);
        // Forward the real scene's events
        AR_EVENTS.forEach(event =>
          arScene.on(event, ((...args: unknown[]) =>
            (this.emitter.emit as (e: string, ...a: unknown[]) => void)(event, ...args)) as never),
        );
        this.arScene = arScene;
        return arScene;
      });
      this.creating.catch(() => (this.creating = null));
    }
    return this.creating;
  }
}
