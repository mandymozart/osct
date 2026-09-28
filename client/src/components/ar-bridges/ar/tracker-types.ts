import type { Matrix4, PerspectiveCamera } from "three";
import type { Target } from "@/types";

/** A camera that sends no picture within this time is reported as not responding */
export const CAMERA_START_TIMEOUT_MS = 10000;

/** What a tracker needs to track a spread: MindAR reads the compiled `.mind`, 8th Wall the target images */
export interface TrackedSpread {
  mindSrc: string;
  targets: readonly Target[];
}

export interface ImageTrackerOptions {
  maxTrack: number;
  /**
   * The anchor matrix of a target (1 unit = target width, origin in the target's centre, the image in the
   * x/y plane), null when the target is lost
   */
  onUpdate: (targetIndex: number, matrix: Matrix4 | null) => void;
}

/**
 * Camera + image tracking, without a renderer (`ArScene` renders). The camera stream survives a spread
 * switch: `loadTargets()` replaces only the tracked targets. Implementations: `ImageTracker` (MindAR) and
 * `EighthWallTracker` (8th Wall engine, exploration 2026-09-28) – chosen by `createImageTracker()`.
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
