import { describe, expect, it, vi } from "vitest";
import type { Target } from "@/types";
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
    GlTextureRenderer: { pipelineModule: () => ({}) },
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
    const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {} });
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
    const tracker = new ImageTracker(document.createElement("div"), { onUpdate: () => {}, onSpreadSeen });
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
});
