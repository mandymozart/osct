import { getTrackerEngine } from "../utils";
import { IImageTracker, ImageTrackerOptions } from "./tracker-types";

/**
 * The image tracker of the chosen engine (`utils/tracker-choice.ts`). Each engine is its own chunk, so only
 * the chosen one downloads: MindAR (TF.js) or the small 8th Wall wrapper (the engine loads as a script).
 */
export const createImageTracker = async (container: HTMLElement, options: ImageTrackerOptions): Promise<IImageTracker> => {
  if (getTrackerEngine() === "8thwall") {
    const { EighthWallTracker } = await import("./tracker-8thwall");
    return new EighthWallTracker(container, options);
  }
  const { ImageTracker } = await import("./tracker");
  return new ImageTracker(container, options);
};

/** Download the chosen engine ahead of the first scan (idle time after startup – nothing is started) */
export const preloadImageTracker = async (): Promise<void> => {
  if (getTrackerEngine() === "8thwall") {
    const { prefetchXr8 } = await import("./xr8");
    return prefetchXr8();
  }
  await import("./tracker");
};
