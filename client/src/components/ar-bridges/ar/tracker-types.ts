import type { Matrix4, PerspectiveCamera } from "three";
import type { Target } from "@/types";

/** A camera that sends no picture within this time is reported as not responding */
export const CAMERA_START_TIMEOUT_MS = 10000;

/** What the tracker needs to track a spread: its targets (the engine's image targets are made from their images) */
export interface TrackedSpread {
  spreadId: string;
  targets: readonly Target[];
}

export interface ImageTrackerOptions {
  /**
   * The anchor matrix of a target (1 unit = target width, origin in the target's centre, the image in the
   * x/y plane), null when the target is lost
   */
  onUpdate: (targetId: string, matrix: Matrix4 | null) => void;
  /**
   * A target of a prepared spread (`prepareTargets()`) is seen steadily while none of the current spread's is –
   * the reader has turned the page
   */
  onSpreadSeen?: (spreadId: string) => void;
}

/**
 * Camera + image tracking, without a renderer (`ArScene` renders). The camera stream survives a spread
 * switch: `loadTargets()` replaces only the tracked targets. Implementation: `ImageTracker` (8th Wall engine).
 */
export interface IImageTracker {
  readonly hasCamera: boolean;
  readonly tracking: boolean;
  /** Request the back camera; throws when it is unavailable or sends no picture */
  startCamera(): Promise<void>;
  /** Track the targets of a spread on the running camera (replaces the previous targets) */
  loadTargets(spread: TrackedSpread): Promise<void>;
  /**
   * Spreads the reader may switch to next (the neighbours): the tracker may get their targets ready ahead, so
   * `loadTargets()` for one of them starts at once. Called after the current spread is tracked.
   */
  prepareTargets(spreads: readonly TrackedSpread[]): void;
  /** Tracking and the camera picture pause, the stream stays */
  pause(): void;
  resume(): void;
  stopTracking(): void;
  /** Release the camera (and the tracking) */
  stop(): void;
  /** Fit the camera picture to the container and give the three.js camera the matching projection */
  fit(camera: PerspectiveCamera): void;
}
