import { ArSceneEvents, ArStatus, IArScene, SceneState } from "@/types";
import { Emitter } from "./utils/emitter";

type ArModule = typeof import("./ar");

let arModule: Promise<ArModule> | null = null;

/** Every scene event, forwarded from the real scene (a record over the event type: a new event can't be left out) */
const SCENE_EVENTS = Object.keys({
  status: true,
  targetFound: true,
  targetLost: true,
  targetTapped: true,
  ready: true,
  spreadSeen: true,
} satisfies Record<keyof ArSceneEvents, true>) as Array<keyof ArSceneEvents>;

/**
 * Load the AR chunk (three.js and the scene; the 8th Wall engine's own files load with the first start).
 * Nothing imports `./ar` statically, so the first paint never waits for it. Retries after a failed load
 * (offline).
 */
export const loadArModule = (): Promise<ArModule> => {
  if (!arModule) {
    arModule = import("./ar").catch(error => {
      arModule = null;
      throw error;
    });
  }
  return arModule;
};

/**
 * The bridge's `IArScene`: records the requested spread and state and hands them to the real `ArScene`
 * once its chunk is loaded – on the first RUNNING request, or earlier via `warmUp()`. Until then it
 * reports `idle`, and `loading` while the chunk loads for a start.
 */
export class LazyArScene implements IArScene {
  private emitter = new Emitter<ArSceneEvents>();
  private scene: IArScene | null = null;
  private creating: Promise<IArScene> | null = null;
  private wantedSpread: string | null = null;
  private wantedState: SceneState = SceneState.STOPPED;
  private disposed = false;

  private lastStatus: ArStatus = "idle";

  constructor(private container: HTMLElement) {
    this.emitter.on("status", status => (this.lastStatus = status));
  }

  get status(): ArStatus {
    return this.scene?.status ?? this.lastStatus;
  }

  get spreadId(): string | null {
    return this.scene?.spreadId ?? null;
  }

  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]): () => void {
    return this.emitter.on(event, listener);
  }

  /** Fetch and evaluate the AR chunk and the tracking engine without building anything (no WebGL, no camera) */
  warmUp(): Promise<void> {
    return loadArModule()
      .then(ar => ar.prefetchXr8())
      .catch(error => console.warn("[ArScene] Could not preload AR:", error));
  }

  async load(spreadId: string): Promise<void> {
    this.wantedSpread = spreadId;
    if (this.scene) return this.scene.load(spreadId);
  }

  async setState(state: SceneState): Promise<void> {
    this.wantedState = state;
    if (this.scene) return this.scene.setState(state);
    if (state !== SceneState.RUNNING) return;
    try {
      const scene = await this.create();
      if (this.disposed) return;
      // Apply the latest requests – they may have changed while the chunk loaded
      if (this.wantedSpread) void scene.load(this.wantedSpread);
      await scene.setState(this.wantedState);
    } catch (error) {
      console.error("[ArScene] AR could not be loaded:", error);
      this.emitter.emit("status", "error", error instanceof Error ? error.message : String(error));
    }
  }

  celebrate(targetId: string): void {
    this.scene?.celebrate(targetId);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.scene?.dispose();
  }

  private create(): Promise<IArScene> {
    if (!this.creating) {
      this.emitter.emit("status", "loading");
      this.creating = loadArModule().then(({ ArScene }) => {
        const scene = new ArScene(this.container);
        // Forward the real scene's events
        SCENE_EVENTS.forEach(event =>
          scene.on(event, ((...args: unknown[]) =>
            (this.emitter.emit as (e: string, ...a: unknown[]) => void)(event, ...args)) as never),
        );
        this.scene = scene;
        return scene;
      });
      this.creating.catch(() => (this.creating = null));
    }
    return this.creating;
  }
}
