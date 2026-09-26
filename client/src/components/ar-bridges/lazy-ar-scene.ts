import { ArSceneEvents, ArStatus, IArScene, SceneState } from "@/types";
import { Emitter } from "./utils/emitter";

type ArModule = typeof import("./ar");

let arModule: Promise<ArModule> | null = null;

/**
 * Load the AR chunk (three.js + MindAR with TF.js, ~⅔ of the app's code). Nothing imports `./ar`
 * statically, so the first paint never waits for it. Retries after a failed load (offline).
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
 * The bridge's `IArScene`: records the wishes (spread, state) and hands them to the real `ArScene`
 * once its chunk is loaded – on the first RUNNING wish, or earlier via `warmUp()` (idle time after
 * startup). Until then it reports `idle`, while the chunk loads for a start `loading`.
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

  /** Fetch and evaluate the AR chunk without building anything (no WebGL, no camera) */
  warmUp(): Promise<void> {
    return loadArModule().then(() => {}, error => console.warn("[ArScene] Could not preload AR:", error));
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
      // The latest wishes – they may have changed while the chunk loaded
      if (this.wantedSpread) void scene.load(this.wantedSpread);
      await scene.setState(this.wantedState);
    } catch (error) {
      console.error("[ArScene] AR could not be loaded:", error);
      this.emitter.emit("status", "error", error instanceof Error ? error.message : String(error));
    }
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
        (["status", "targetFound", "targetLost", "ready"] as const).forEach(event =>
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
