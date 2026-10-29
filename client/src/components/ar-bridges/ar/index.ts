/**
 * The reader's AR scene: the engine's `ArScene` with the 8th Wall image tracker and the reader's graphics options.
 * Loaded lazily (`import("./ar")` in lazy-ar-scene.ts): three.js and the engine's scene form their own chunk; the
 * tracking engine's files load with the scene's first start (`prefetchXr8()` fetches them ahead into the HTTP cache).
 */
import { GraphicsService } from "@/services";
import { ArScene } from "@engine/scene";
import type { IArScene } from "@engine/types/scene";
import { ImageTracker, prefetchXr8 } from "@engine/scene/xr8-tracker";

export * from "@engine/scene";
export { prefetchXr8 };

export const createReaderScene = (container: HTMLElement): IArScene =>
  new ArScene(container, {
    createTracker: ({ container, options }) => new ImageTracker(container, options),
    graphics: GraphicsService.getInstance(),
  });
