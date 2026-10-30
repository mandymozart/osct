import { describe, expect, it, vi } from "vitest";
import { type Color, PerspectiveCamera, Scene, Vector2 } from "three";
import { passesFor } from "../../content/game-config";
import { PostChain } from "../post/chain";
import { drawPlan } from "../view";
import "../post/index";

// Which passes a spread shows, how a frame is drawn with them, and the look-around world inside the chain
describe("the passes a spread shows", () => {
  const book = { passes: [{ type: "vignette" }] };

  it("the book's passes are the master for every spread without a list of its own", () => {
    expect(passesFor({}, book)).toEqual([{ type: "vignette" }]);
    expect(passesFor(undefined, book)).toEqual([{ type: "vignette" }]);
  });

  it("a spread's own list overrides the book's, an empty one turns them off there", () => {
    expect(passesFor({ passes: [{ type: "bloom" }] }, book)).toEqual([{ type: "bloom" }]);
    expect(passesFor({ passes: [] }, book)).toEqual([]);
  });

  it("without either there are none", () => {
    expect(passesFor({}, {})).toEqual([]);
  });
});

describe("how a frame is drawn", () => {
  it("without passes the chain stays out and the world is drawn onto the screen as before (no cost on a phone)", () => {
    expect(drawPlan({ passes: false, underlay: true, backdrop: false })).toEqual({ chain: false, underlay: "screen", mask: false });
    expect(drawPlan({ passes: false, underlay: false, backdrop: true })).toEqual({ chain: false, underlay: "none", mask: false });
  });

  it("with passes the world and its sky go into the chain, and a grade of the AR layer alone gets its mask", () => {
    expect(drawPlan({ passes: true, underlay: true, backdrop: false })).toEqual({ chain: true, underlay: "chain", mask: true });
  });

  it("with passes and no world: the mask only where a backdrop stands in for the camera picture (the editor's desk)", () => {
    expect(drawPlan({ passes: true, underlay: false, backdrop: false })).toEqual({ chain: true, underlay: "none", mask: false });
    expect(drawPlan({ passes: true, underlay: false, backdrop: true })).toEqual({ chain: true, underlay: "none", mask: true });
  });
});

describe("the look-around world through the chain", () => {
  const renderer = {
    autoClear: true,
    getSize: () => new Vector2(300, 200),
    getPixelRatio: () => 1,
    capabilities: { maxSamples: 0 },
    getClearColor: (color: Color) => color,
    getClearAlpha: () => 1,
    setClearColor: vi.fn(),
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
  };
  type Passes = { enabled: boolean; clear: boolean; render(r: unknown, w: unknown, read: unknown): void }[];

  const build = (passes: { type: string; [key: string]: unknown }[]) => {
    renderer.render.mockClear();
    renderer.setRenderTarget.mockClear();
    renderer.clear.mockClear();
    const chain = new PostChain(renderer as never, new Scene(), new PerspectiveCamera());
    const composer = (chain as unknown as { composer: { passes: Passes; render(): void } }).composer;
    chain.set(passes);
    return { chain, composer };
  };

  it("draws the world into the chain's buffer first and the scene over it without clearing", () => {
    const { chain, composer } = build([{ type: "vignette" }]);
    const seen: { first: boolean; sceneClears: boolean }[] = [];
    const order: string[] = [];
    const underlay = vi.fn(() => order.push("underlay"));
    renderer.clear.mockImplementation(() => order.push("clear"));
    renderer.setRenderTarget.mockImplementation((target: unknown) => order.push(`target:${String(target)}`));
    vi.spyOn(composer, "render").mockImplementation(() => {
      seen.push({ first: composer.passes[0].enabled, sceneClears: composer.passes[1].clear });
      composer.passes[0].render(renderer, "write", "read");
    });
    chain.render({ arLayers: 1 }, underlay);
    expect(seen).toEqual([{ first: true, sceneClears: false }]);
    expect(underlay).toHaveBeenCalledOnce();
    expect(order).toEqual(["target:read", "clear", "underlay", "target:read"]);
    renderer.clear.mockReset();
    renderer.setRenderTarget.mockReset();
    chain.dispose();
  });

  it("without the world the buffer starts empty, as before", () => {
    const { chain, composer } = build([{ type: "vignette" }]);
    const seen: { first: boolean; sceneClears: boolean }[] = [];
    vi.spyOn(composer, "render").mockImplementation(() => seen.push({ first: composer.passes[0].enabled, sceneClears: composer.passes[1].clear }));
    chain.render({ arLayers: 1 }, () => {});
    chain.render(null, null);
    expect(seen[1]).toEqual({ first: false, sceneClears: true });
    chain.dispose();
  });

  it("draws the AR layer's mask only while a pass uses it (a grade of the whole picture needs none)", () => {
    const all = build([{ type: "grade", reach: "all" }, { type: "bloom" }]);
    vi.spyOn(all.composer, "render").mockImplementation(() => {});
    all.chain.render({ arLayers: 1 }, () => {});
    expect(renderer.render).not.toHaveBeenCalled();
    all.chain.dispose();

    const ar = build([{ type: "grade" }]);
    vi.spyOn(ar.composer, "render").mockImplementation(() => {});
    ar.chain.render({ arLayers: 1 }, () => {});
    expect(renderer.render).toHaveBeenCalledOnce();
    ar.chain.dispose();
  });
});
