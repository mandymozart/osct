import { EntityData } from "./game-config";

/**
 * What the AR scene (three.js / 8th Wall) should be doing. Derived from the game mode and the current
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
 * DOM event on `document` (detail `{ targetId }`), dispatched by `<ar-bridge>` when a target is found
 * for the first time. Finding a target unlocks it; opening its entry marks it consulted.
 * `<found-indicator>` shows "New entry unlocked" and the entity plays its unlock animation.
 */
export const TARGET_UNLOCKED_EVENT = "osct:target-unlocked";

/**
 * Duration of an entity's unlock animation (ar/celebration.ts); the found indicator stays up as long.
 * Defined here so the indicator does not import the lazily loaded AR chunk.
 */
export const ENTITY_UNLOCK_MS = 4200;

/** Marker in the AR error message for a camera start timeout (maps to CameraPermissionStatus.NOT_RESPONDING) */
export const CAMERA_NOT_RESPONDING = "camera not responding";

/**
 * DOM event on `document` (detail `TuneEntityDetail`), dispatched by the debug tune panel: show a target's entity
 * with other placement / filter values (`entity`), or with its content again (`entity: null`). `<ar-bridge>` hands it
 * to the scene; the content and the game configuration stay unchanged.
 */
export const TUNE_ENTITY_EVENT = "osct:tune-entity";

export interface TuneEntityDetail {
  targetId: string;
  entity: EntityData | null;
}

export type ArSceneEvents = {
  targetFound: (targetId: string) => void;
  targetLost: (targetId: string) => void;
  status: (status: ArStatus, error?: string) => void;
  /** A found target's AR entity was tapped (scan mode) */
  targetTapped: (targetId: string) => void;
  /** The spread's targets are loaded and tracking began */
  ready: (spreadId: string) => void;
  /** A neighbouring spread's page is in view instead of the current spread (the reader turned the page) */
  spreadSeen: (spreadId: string) => void;
};

/**
 * The only code that touches three.js / the 8th Wall engine (`ArScene`, loaded lazily via `LazyArScene`). No store
 * access – `<ar-bridge>` connects it to the game state. Calls are queued and the latest request wins
 * (switching spreads while loading builds only the newest spread).
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
  /**
   * Show a target's entity with these values instead of the content's (debug tune panel) – kept across spread
   * switches until `null` restores the content
   */
  tuneEntity(targetId: string, entity: EntityData | null): void;
  /** Tear everything down (camera released, scene removed) */
  dispose(): Promise<void>;
  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]): () => void;
}
