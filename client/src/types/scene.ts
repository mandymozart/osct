/**
 * What the A-Frame scene / MindAR should be doing. Derived from the game mode and the current
 * route (`aframe-bridges/utils/scene-state.ts`), applied by `<ar-bridge>`. Ordered from least to most active.
 * STOPPED: camera released · PAUSED: tracking + video paused, camera stream kept (instant resume,
 * last frame frozen behind the UI) · RUNNING: camera, tracking and rendering.
 */
export enum SceneState {
  STOPPED = 0,
  PAUSED = 1,
  RUNNING = 2,
}

/**
 * What the AR scene is doing. Reported to the store as `arStatus`.
 * idle: no scene · loading: building the spread's scene · ready: scene loaded, camera off ·
 * starting: camera requested, targets loading · running: tracking · paused: tracking + camera video
 * paused (stream kept) · error: camera or AR failed (see `arError`).
 */
export type ArStatus = "idle" | "loading" | "ready" | "starting" | "running" | "paused" | "error";

export type ArSceneEvents = {
  targetFound: (targetId: string) => void;
  targetLost: (targetId: string) => void;
  status: (status: ArStatus, error?: string) => void;
  /** The spread's `.mind` is loaded and tracking began (MindAR `arReady`) */
  ready: (spreadId: string) => void;
};

/**
 * The only code that touches A-Frame / MindAR (`ArScene`). Plain object, no store access – the
 * `<ar-bridge>` element connects it to the game state. Calls are queued; the latest wish wins
 * (a spread switch while loading builds only the newest spread).
 */
export interface IArScene {
  readonly status: ArStatus;
  readonly spreadId: string | null;
  /** Build the scene for a spread (camera stays as wanted by `setState`) */
  load(spreadId: string): Promise<void>;
  /** RUNNING = camera + tracking, PAUSED = frozen frame, stream kept, STOPPED = camera released */
  setState(state: SceneState): Promise<void>;
  /** Tear everything down (camera released, scene removed) */
  dispose(): Promise<void>;
  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]): () => void;
}
