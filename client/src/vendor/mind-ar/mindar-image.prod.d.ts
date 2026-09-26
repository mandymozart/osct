/**
 * Types of the vendored MindAR 1.2.5 image-tracking build (`mind-ar/dist/mindar-image.prod.js` and its
 * chunks, copied unchanged – see README.md). Only what the app uses.
 */

export interface ControllerUpdate {
  type: "updateMatrix" | "processDone";
  targetIndex: number;
  /** Column-major 4×4 world matrix of the target, null when it is lost */
  worldMatrix: number[] | null;
}

export interface ControllerOptions {
  inputWidth: number;
  inputHeight: number;
  onUpdate?: ((data: ControllerUpdate) => void) | null;
  maxTrack?: number;
  filterMinCF?: number | null;
  filterBeta?: number | null;
  warmupTolerance?: number | null;
  missTolerance?: number | null;
  debugMode?: boolean;
}

export class Controller {
  constructor(options: ControllerOptions);
  readonly inputWidth: number;
  readonly inputHeight: number;
  /** Loads a `.mind` file; one [width, height] per target */
  addImageTargets(url: string): Promise<{ dimensions: Array<[number, number]> }>;
  /** Warms up the GPU kernels (slow on the first run) */
  dummyRun(input: HTMLVideoElement): Promise<void> | void;
  processVideo(input: HTMLVideoElement): void;
  stopProcessVideo(): void;
  dispose(): void;
  getProjectionMatrix(): number[];
}

export class Compiler {}
export class UI {}
