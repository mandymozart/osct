import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTexture, PerspectiveCamera, Scene, type Texture, Vector2 } from "three";
import type { PassSpec } from "../../types/index";
import { PostChain } from "../post/chain";
import type { PostPass } from "../post/registry";
import { feedbackCount, type FeedbackRenderer, stepFeedbacks } from "../feedback";
import { installedPlugins, installPlugin, uninstallPlugin } from "../plugins";
import { deleteTextureRegistration, setTextureRegistration } from "../textures";
import "../post/index";

/** A plugin's passes in the post chain (#216): in order, skipped when they fail, their buffers and textures */

const SPEC: PassSpec = { description: "Scan lines.", params: { lines: { kind: "number", default: 200, min: 10, max: 800, description: "How many." } } };
const PICTURE: PassSpec = { description: "A picture over it.", params: { picture: { kind: "texture", default: "", description: "The picture." } } };

/** three's Pass shape without a renderer */
const fakePass = (extra: Partial<PostPass> = {}): PostPass =>
  ({ enabled: true, needsSwap: true, clear: false, renderToScreen: false, setSize: vi.fn(), render: vi.fn(), dispose: vi.fn(), ...extra }) as unknown as PostPass;

const renderer = { getSize: () => new Vector2(300, 200), getPixelRatio: () => 1, capabilities: { maxSamples: 0 } };

const chain = () => new PostChain(renderer as never, new Scene(), new PerspectiveCamera());

interface ChainInside {
  instances: { data: { type: string }; pass: PostPass }[];
  composer: { passes: PostPass[]; render(delta?: number): void };
}
const inside = (c: PostChain) => c as unknown as ChainInside;

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.restoreAllMocks();
});

describe("a plugin's pass in the chain", () => {
  it("is built from its factory in its place among the built-in passes, its parameters resolved", () => {
    const made: Record<string, unknown>[] = [];
    installPlugin("scan", { register: api => api.registerPass("scanLines", SPEC, ({ params }) => { made.push(params); return fakePass(); }) });
    const c = chain();
    c.set([{ type: "vignette" }, { type: "scanLines", lines: 300 }, { type: "grade" }]);
    expect(inside(c).instances.map(i => i.data.type)).toEqual(["vignette", "scanLines", "grade"]);
    expect(made).toEqual([{ lines: 300 }]);
    // underlay, render, the three passes, output
    expect(inside(c).composer.passes).toHaveLength(6);
    expect(inside(c).composer.passes[3]).toBe(inside(c).instances[1].pass);
    c.dispose();
  });

  it("a factory that throws or returns nothing is logged and skipped – the other passes run", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    installPlugin("broken", {
      register: api => {
        api.registerPass("throws", SPEC, () => { throw new Error("no shader"); });
        api.registerPass("empty", SPEC, () => null as never);
      },
    });
    const c = chain();
    c.set([{ type: "throws" }, { type: "vignette" }, { type: "empty" }, { type: "grade" }]);
    expect(inside(c).instances.map(i => i.data.type)).toEqual(["vignette", "grade"]);
    expect(errors.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('the pass "throws" (broken) could not be built'),
      expect.stringContaining('the pass "empty" (broken) returned no three.js pass'),
    ]);
    c.dispose();
  });

  it("a pass that throws while rendering is switched off – no swap that frame, the chain renders on", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pass = fakePass({ render: vi.fn(() => { throw new Error("lost context"); }) as never });
    installPlugin("flaky", { register: api => api.registerPass("flaky", SPEC, () => pass) });
    const c = chain();
    c.set([{ type: "flaky" }, { type: "vignette" }]);
    const built = inside(c).instances[0].pass;
    expect(() => built.render({} as never, {} as never, {} as never, 0, false)).not.toThrow();
    expect(built.enabled).toBe(false);
    expect(built.needsSwap).toBe(false);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('the pass "flaky" (flaky) failed while rendering – switched off: Error: lost context'));
    c.dispose();
  });

  it("a live edit updates it in place; the plugin run again builds it anew from the new factory", () => {
    const update = vi.fn();
    const first = vi.fn(() => fakePass({ update }));
    installPlugin("scan", { register: api => api.registerPass("scanLines", SPEC, first) });
    const c = chain();
    c.set([{ type: "scanLines" }]);
    const old = inside(c).instances[0].pass;
    c.set([{ type: "scanLines", lines: 400 }]);
    expect(first).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({ lines: 400 });
    const second = vi.fn(() => fakePass());
    installPlugin("scan", { register: api => api.registerPass("scanLines", SPEC, second) });
    c.set([{ type: "scanLines", lines: 400 }]);
    expect(second).toHaveBeenCalledOnce();
    expect(old.dispose).toHaveBeenCalledOnce();
    c.dispose();
  });

  it("an update that throws builds the pass anew", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = vi.fn(() => fakePass({ update: () => { throw new Error("bad"); } }));
    installPlugin("scan", { register: api => api.registerPass("scanLines", SPEC, factory) });
    const c = chain();
    c.set([{ type: "scanLines" }]);
    c.set([{ type: "scanLines", lines: 20 }]);
    expect(factory).toHaveBeenCalledTimes(2);
    c.dispose();
  });

  it("a feedback buffer made in the factory steps while the chain renders with passes and goes with the pass", () => {
    const draws: unknown[] = [];
    const stub: FeedbackRenderer = { extensions: { has: () => true }, setRenderTarget: () => undefined, getRenderTarget: () => null, render: object => draws.push(object) };
    let trail: Texture | null = null;
    installPlugin("trails", {
      register: api => api.registerPass("trails", SPEC, () => {
        trail = api.feedback({ width: 8, height: 8, fragment: "void main() { gl_FragColor = texture(iChannel0, vUv) * 0.9; }" }).texture;
        return fakePass();
      }),
    });
    const c = chain();
    c.set([{ type: "trails" }]);
    expect(trail).not.toBeNull();
    expect(feedbackCount()).toBe(1);
    stepFeedbacks(stub, 1 / 60);
    expect(draws).toHaveLength(1);
    c.enabled = false; // the editor outside *rendered*: the passes wait, their buffers too
    stepFeedbacks(stub, 1 / 60);
    expect(draws).toHaveLength(1);
    c.enabled = true;
    stepFeedbacks(stub, 1 / 60);
    expect(draws).toHaveLength(2);
    c.set([{ type: "vignette" }]);
    expect(feedbackCount()).toBe(0);
    c.dispose();
  });

  it("a texture parameter arrives as a texture (a procedural one of a plugin), freed with the pass", () => {
    const picture = new DataTexture(new Uint8Array(4), 1, 1);
    const dispose = vi.spyOn(picture, "dispose");
    setTextureRegistration("dots", { plugin: "test", spec: { description: "", params: {} }, draw: () => picture });
    const got: unknown[] = [];
    installPlugin("overlay", { register: api => api.registerPass("overlay", PICTURE, ({ params }) => { got.push(params.picture); return fakePass(); }) });
    const c = chain();
    c.set([{ type: "overlay", picture: "dots" }]);
    expect(got).toEqual([picture]);
    c.set([]);
    expect(dispose).toHaveBeenCalled();
    deleteTextureRegistration("dots");
    c.dispose();
  });

  it("warns once when the list goes beyond the phone budget", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const c = chain();
    const four = [{ type: "vignette" }, { type: "grade" }, { type: "grade" }, { type: "vignette" }];
    c.set(four);
    c.set(four.map(pass => ({ ...pass })));
    expect(warn.mock.calls.filter(call => String(call[0]).includes("phone budget"))).toHaveLength(1);
    c.dispose();
  });
});
