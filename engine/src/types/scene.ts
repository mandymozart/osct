import type { Camera, Object3D, Scene } from "three";
import type { EntityData, PassData } from "./content";

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
 * Duration of an entity's unlock animation (scene/celebration.ts); the reader's found indicator stays up as long.
 * Defined here so an app does not import the lazily loaded scene for it.
 */
export const ENTITY_UNLOCK_MS = 3000;

/** Marker in the AR error message for a camera start timeout (maps to CameraPermissionStatus.NOT_RESPONDING) */
export const CAMERA_NOT_RESPONDING = "camera not responding";

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
 * The only code that touches three.js and the tracking engine (`ArScene`; the reader loads it lazily via its
 * `LazyArScene`). No store access – the app connects it to its state (the reader's `<ar-bridge>`). Calls are queued and the latest request wins
 * (switching spreads while loading builds only the newest spread).
 */
/** A model node's animation as the editor's timeline sees it (the `animation` component plays it) */
export interface NodeTimeline {
  clips: Array<{ name: string; duration: number }>;
  /** The clip playing or paused, its time in seconds, whether it runs */
  state(): { clip: string; time: number; playing: boolean; duration: number };
  play(clip?: string): void;
  pause(): void;
  seek(time: number): void;
}

/** The running scene opened for editor tools: three.js objects, the canvas, a frame hook, a hit test */
export interface SceneInspection {
  scene: Scene;
  camera: Camera;
  domElement: HTMLElement;
  /** Every rendered frame */
  onFrame(listener: (delta: number) => void): () => void;
  /** The placement group of a node of a target's entity (`[]` = the root), null when the spread has no such node */
  nodeObject(targetId: string, path: number[]): Object3D | null;
  /** The found entity under a point of the screen (client px), as a tap would report it */
  hitTest(clientX: number, clientY: number): string | null;
  /** Tap a found target's entity without aiming at it – the same path as the reader's tap (`onTap`, `targetTapped`); false when nothing was tapped (not found, no entity, the scene not running) */
  tap(targetId: string): boolean;
  /** The timeline of a model node (its clips), null for other nodes or before it is built */
  nodeTimeline(targetId: string, path: number[]): NodeTimeline | null;
}

export interface IArScene {
  readonly status: ArStatus;
  readonly spreadId: string | null;
  /** Build the scene for a spread (camera stays as wanted by `setState`) */
  load(spreadId: string): Promise<void>;
  /** RUNNING = camera + tracking, PAUSED = frozen frame, stream kept, STOPPED = camera released */
  setState(state: SceneState): Promise<void>;
  /** Play the discovery animation on a found target's entity (first find = unlock) */
  celebrate(targetId: string): void;
  /** The content changed under the current spread (the editor saved): build the spread again from it */
  refresh(): Promise<void>;
  /** The colour under a point of the scene's canvas (CSS px from its top left) as `#rrggbb`, null while nothing renders */
  sampleColor(x: number, y: number): string | null;
  /** What an editor tool needs of the running scene (the gizmo, hover); null while nothing renders */
  inspect(): SceneInspection | null;
  /**
   * Show a target's entity with these values instead of the content's (the editor's live edit) – kept across
   * spread switches until `null` restores the content
   */
  overrideEntity(targetId: string, entity: EntityData | null): void;
  /** Show the current spread with these post-processing passes instead of the content's (the editor's live edit); `null` restores the content's */
  overridePasses(passes: PassData[] | null): void;
  /** Post-processing on (the default) or off – the editor's viewport shows passes under *rendered* only; nothing is rendered twice while off */
  setPostProcessing(enabled: boolean): void;
  /** Tear everything down (camera released, scene removed) */
  dispose(): Promise<void>;
  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]): () => void;
}
