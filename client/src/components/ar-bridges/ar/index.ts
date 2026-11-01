/**
 * The reader's AR scene: the engine's `ArScene` with the 8th Wall image tracker and the reader's graphics options.
 * Loaded lazily (`import("./ar")` in lazy-ar-scene.ts): three.js and the engine's scene form their own chunk; the
 * tracking engine's files load with the scene's first start (`prefetchXr8()` fetches them ahead into the HTTP cache).
 * The reader tells the engine what it knows from its build: where the tracking engine's files are served and whether
 * this is a development build (the scene's debug handles).
 */
import { GameStoreService, GraphicsService } from "@/services";
import { ArScene, type ProgressReader } from "@engine/scene";
import type { IArScene } from "@engine/types/scene";
import { ImageTracker, prefetchXr8 as prefetchEngine } from "@engine/scene/xr8-tracker";

export * from "@engine/scene";

/** Where the build serves the 8th Wall engine's files (vite.config.js copies them to `assets/xr8/`) */
const XR8_BASE = `${import.meta.env.BASE_URL}assets/xr8/`;

/** Fetch the tracking engine's files into the HTTP cache (idle time) */
export const prefetchXr8 = (): Promise<void> => prefetchEngine(XR8_BASE);

/** What the book's plugins may know of the reader's progress (`api.progress`, the `book` scope): through the history, never the store */
export const readerProgress = (): ProgressReader => {
  const history = GameStoreService.getInstance().history;
  return {
    unlocked: targetId => history.isUnlocked(targetId),
    consulted: entryId => history.isConsulted(entryId),
    variables: {
      get: name => history.getVariable(name),
      set: (name, value) => history.setVariable(name, value),
      all: () => history.getVariables(),
    },
  };
};

export const createReaderScene = (container: HTMLElement): IArScene =>
  new ArScene(container, {
    createTracker: ({ container, options }) => new ImageTracker(container, options, XR8_BASE),
    graphics: GraphicsService.getInstance(),
    progress: readerProgress(),
    debug: import.meta.env.DEV,
  });
