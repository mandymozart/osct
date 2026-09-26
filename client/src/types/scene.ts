/**
 * What the AR scene (three.js / MindAR) should be doing. Derived from the game mode and the current
 * route (`ar-bridges/utils/scene-state.ts`), applied by `<ar-bridge>`. Ordered from least to most active.
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

/**
 * DOM event (on `document`, detail `{ targetId }`): a target was found for the first time = unlocked
 * (Tilman 2026-09-26: finding unlocks, tapping opens the entry = consulted). Sent by `<ar-bridge>`,
 * shown by `<found-indicator>` ("New entry unlocked"); entities celebrate in the AR scene.
 */
export const TARGET_UNLOCKED_EVENT = "osct:target-unlocked";

/**
 * Length of an AR entity's unlock animation (ar/celebration.ts) – the found indicator's "New entry
 * unlocked" stays as long (defined here: the indicator must not import the AR chunk)
 */
export const ENTITY_UNLOCK_MS = 4200;

/** Part of the AR error message when the camera sends no picture in time (see CameraPermissionStatus.NOT_RESPONDING) */
export const CAMERA_NOT_RESPONDING = "camera not responding";

export type ArSceneEvents = {
  targetFound: (targetId: string) => void;
  targetLost: (targetId: string) => void;
  status: (status: ArStatus, error?: string) => void;
  /** A found target's AR entity was tapped (scan mode) */
  targetTapped: (targetId: string) => void;
  /** The spread's `.mind` is loaded and tracking began */
  ready: (spreadId: string) => void;
};

/**
 * The only code that touches three.js / MindAR (`ArScene`, loaded lazily via `LazyArScene`). Plain object, no store access – the
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
  /** Play the discovery animation on a found target's entity (first find = unlock) */
  celebrate(targetId: string): void;
  /** Tear everything down (camera released, scene removed) */
  dispose(): Promise<void>;
  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]): () => void;
}
