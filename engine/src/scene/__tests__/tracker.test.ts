import { describe, expect, it, vi } from "vitest";
import type { Target } from "../../types/index";
import type { TrackedSpread } from "../tracker-types";
import type { XrPipelineModule } from "../xr8";

/**
 * A fake engine that behaves like `@8thwall/engine` on `configure({ imageTargetData })`: it keeps the targets it
 * already has, extracts only new ones and reports `imagescanning` (all loaded names) when it has done so.
 */
const engine = vi.hoisted(() => ({
  loaded: new Set<string>(),
  extracted: [] as string[],
  modules: [] as XrPipelineModule[],
  /** The fragment shaders the camera renderer was configured with */
  shaders: [] as (string | undefined)[],
}));

vi.mock("../xr8", async importOriginal => {
  const scan = () => engine.modules.forEach(module => module.listeners
    ?.find(listener => listener.event === "reality.imagescanning")
    ?.process({ detail: { imageTargets: [...engine.loaded].map(name => ({ name })) } }));
  const XR8 = {
    XrController: {
      pipelineModule: () => ({}),
      configure: ({ imageTargetData }: { imageTargetData?: Array<{ name: string }> }) => {
        if (!imageTargetData) return;
        const names = imageTargetData.map(target => target.name);
        const added = names.filter(name => !engine.loaded.has(name));
        engine.loaded = new Set(names);
        if (!added.length) return;
        engine.extracted.push(...added);
        setTimeout(scan, 0);
      },
      updateCameraProjectionMatrix: () => {},
    },
    GlTextureRenderer: { pipelineModule: () => ({}), configure: ({ fragmentSource }: { fragmentSource?: string }) => engine.shaders.push(fragmentSource) },
    XrConfig: { device: () => ({ ANY: "any" }), camera: () => ({ BACK: "back" }) },
    addCameraPipelineModules: (modules: XrPipelineModule[]) => engine.modules.push(...modules.filter(m => m.name)),
    run: () => engine.modules.forEach(module => module.onStart?.({ canvasWidth: 1, canvasHeight: 1 })),
    stop: () => {},
    clearCameraPipelineModules: () => { engine.modules = []; },
  };
  return {
    ...(await importOriginal<typeof import("../xr8")>()),
    loadXr8: async () => XR8,
    makeImageTarget: async (src: string) => ({
      data: { type: "PLANAR", name: src, imagePath: src, metadata: null, properties: {} },
      widthFactor: 1,
    }),
  };
});

const { ImageTracker } = await import("../tracker");
const { getEngineState } = await import("../../utils/tracker-debug");

/** An engine image event for a target (pose details don't matter here) */
const image = (event: "imagefound" | "imageupdated" | "imagelost", name: string) =>
  engine.modules.forEach(module => module.listeners
    ?.find(listener => listener.event === `reality.${event}`)
    ?.process({ detail: { name, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, scaledWidth: 1, scaledHeight: 1 } }));

const spread = (id: string): TrackedSpread => ({
  spreadId: id,
  targets: [0, 1].map(n => ({ id: `${id}-${n}`, imageSrc: `${id}-${n}.jpg` }) as unknown as Target),
});

describe("ImageTracker spread switches", () => {
  it("keeps the neighbours' targets loaded, so switching to one extracts nothing", async () => {
    const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {} }, "/assets/xr8/");
    await tracker.startCamera();

    await tracker.loadTargets(spread("s2"));
    expect(engine.extracted).toEqual(["s2-0.jpg", "s2-1.jpg"]);

    tracker.prepareTargets([spread("s1"), spread("s3")]);
    await vi.waitFor(() => expect(engine.extracted).toHaveLength(6));

    // To a neighbour: already extracted – loadTargets returns without waiting for the engine
    engine.extracted = [];
    tracker.stopTracking();
    await tracker.loadTargets(spread("s3"));
    expect(engine.extracted).toEqual([]);
    expect(tracker.tracking).toBe(true);

    // Its neighbours: s2 is kept, s1 unloaded, only s4 is new
    tracker.prepareTargets([spread("s2"), spread("s4")]);
    await vi.waitFor(() => expect(engine.extracted).toEqual(["s4-0.jpg", "s4-1.jpg"]));
    expect([...engine.loaded].sort()).toEqual(["s2-0.jpg", "s2-1.jpg", "s3-0.jpg", "s3-1.jpg", "s4-0.jpg", "s4-1.jpg"]);

    tracker.stop();
  });

  it("reports a neighbouring spread held in view while nothing of the current spread is", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const onSpreadSeen = vi.fn();
    const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {}, onSpreadSeen }, "/assets/xr8/");
    await tracker.startCamera();
    await tracker.loadTargets(spread("s2"));
    tracker.prepareTargets([spread("s1"), spread("s3")]);
    await vi.waitFor(() => expect(engine.loaded.has("s3-0.jpg")).toBe(true));

    // A glimpse is not enough
    image("imagefound", "s3-0.jpg");
    now.mockReturnValue(200);
    image("imageupdated", "s3-0.jpg");
    expect(onSpreadSeen).not.toHaveBeenCalled();

    // While a current target is found, the neighbour is ignored
    image("imagefound", "s2-1.jpg");
    now.mockReturnValue(600);
    image("imageupdated", "s3-0.jpg");
    expect(onSpreadSeen).not.toHaveBeenCalled();

    // The current page left the view: the neighbour held for 400 ms is reported …
    image("imagelost", "s2-1.jpg");
    now.mockReturnValue(700);
    image("imageupdated", "s3-0.jpg");
    image("imageupdated", "s3-0.jpg");
    expect(onSpreadSeen).toHaveBeenCalledTimes(1);
    expect(onSpreadSeen).toHaveBeenCalledWith("s3");
    // … and again after another 400 ms if the app did not switch
    now.mockReturnValue(1000);
    image("imageupdated", "s3-0.jpg");
    expect(onSpreadSeen).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1100);
    image("imageupdated", "s3-0.jpg");
    expect(onSpreadSeen).toHaveBeenCalledTimes(2);

    tracker.stop();
    now.mockRestore();
  });

  it("reports every target the engine sees, of any held spread, and the last automatic switch (debug view)", async () => {
    engine.loaded = new Set(); engine.extracted = [];
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {}, onSpreadSeen: () => {} }, "/assets/xr8/");
    await tracker.startCamera();
    await tracker.loadTargets(spread("s2"));
    tracker.prepareTargets([spread("s3")]);
    await vi.waitFor(() => expect(engine.loaded.has("s3-1.jpg")).toBe(true));

    image("imagefound", "s2-0.jpg");
    image("imagefound", "s3-1.jpg");
    expect(getEngineState().seen).toEqual(["s2-0", "s3-1"]);
    image("imagelost", "s2-0.jpg");
    expect(getEngineState().seen).toEqual(["s3-1"]);
    expect(getEngineState().lastSwitch).toBeNull();

    now.mockReturnValue(500);
    image("imageupdated", "s3-1.jpg");
    expect(getEngineState().lastSwitch).toMatchObject({ spreadId: "s3", targetId: "s3-1" });
    tracker.stop();
    expect(getEngineState().seen).toEqual([]);
    now.mockRestore();
  });

  describe("grow mode", () => {
    const reset = () => { engine.loaded = new Set(); engine.extracted = []; };
    const all = (ids: string[]) => ids.flatMap(id => [`${id}-0.jpg`, `${id}-1.jpg`]);

    it("adds the spreads nearest first, one batch after the other, and drops nothing", async () => {
      reset();
      const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {} }, "/assets/xr8/");
      await tracker.startCamera();
      await tracker.loadTargets(spread("s2"));
      tracker.growTargets([spread("s3"), spread("s1"), spread("s4"), spread("s0")]);
      await vi.waitFor(() => expect(engine.extracted).toHaveLength(10), { timeout: 5000 });
      // Two targets per spread, at most three per batch: one spread per configure, in the given order
      expect(engine.extracted).toEqual(all(["s2", "s3", "s1", "s4", "s0"]));
      expect(engine.loaded.size).toBe(10);
      expect(tracker.heldSpreads).toBe(5);
      tracker.stop();
    });

    it("keeps growing across a spread switch, in the new order, without unloading", async () => {
      reset();
      const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {} }, "/assets/xr8/");
      await tracker.startCamera();
      await tracker.loadTargets(spread("s2"));
      tracker.growTargets([spread("s3"), spread("s1"), spread("s4"), spread("s0")]);
      await vi.waitFor(() => expect(engine.loaded.has("s3-1.jpg")).toBe(true), { timeout: 5000 });

      // The reader turned to s4: it is tracked at once, the rest grows from there
      tracker.stopTracking();
      await tracker.loadTargets(spread("s4"));
      tracker.growTargets([spread("s5"), spread("s3"), spread("s6"), spread("s2"), spread("s1"), spread("s0")]);
      await vi.waitFor(() => expect(engine.loaded.size).toBe(14), { timeout: 8000 });
      expect(engine.extracted.slice(0, 6)).toEqual(all(["s2", "s3", "s4"]));
      expect(engine.extracted.indexOf("s5-0.jpg")).toBeLessThan(engine.extracted.indexOf("s6-0.jpg"));
      expect(new Set(engine.extracted).size).toBe(engine.extracted.length); // nothing extracted twice
      tracker.stop();
    });

    it("a fixed window ends the growth", async () => {
      reset();
      const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {} }, "/assets/xr8/");
      await tracker.startCamera();
      await tracker.loadTargets(spread("s2"));
      tracker.growTargets([spread("s3"), spread("s1"), spread("s4")]);
      tracker.prepareTargets([spread("s1")]);
      await vi.waitFor(() => expect([...engine.loaded].sort()).toEqual(all(["s1", "s2"])), { timeout: 5000 });
      await new Promise(resolve => setTimeout(resolve, 600));
      expect([...engine.loaded].sort()).toEqual(all(["s1", "s2"]));
      tracker.stop();
    });
  });
});

describe("ImageTracker camera grade", () => {
  it("draws the camera picture with the grade's shader – given before the start, while it runs, and back to the engine's", async () => {
    engine.shaders = [];
    const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {} }, "/assets/xr8/");
    tracker.gradeCamera("graded");
    expect(engine.shaders).toEqual([]);
    await tracker.startCamera();
    expect(engine.shaders).toEqual(["graded"]);
    tracker.gradeCamera("graded");
    tracker.gradeCamera("other");
    expect(engine.shaders).toEqual(["graded", "other"]);
    tracker.gradeCamera(null);
    expect(engine.shaders[2]).toMatch(/gl_FragColor = texture2D\(sampler, texUv\)/);
    tracker.stop();
  });
});
