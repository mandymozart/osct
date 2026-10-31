import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PerspectiveCamera, Scene, type ShaderMaterial, Vector2 } from "three";
import type { PassData } from "@engine/types";
import { installedPlugins, installPlugin, type PluginModule, uninstallPlugin } from "@engine/scene/plugins";
import { passContext, passRegistration, type PostPass } from "@engine/scene/post/registry";
import { PostChain } from "@engine/scene/post/chain";
import { transpilePlugin } from "../compile";

/**
 * The demo's scan lines (#216): the real plugin (`fixtures/demo/plugins/scanlines`) registered through the engine, its
 * pass built from the factory and rendered by a renderer that records instead of drawing (no WebGL in the tests).
 */

const SCANLINES = readFileSync(resolve(process.cwd(), "../fixtures/demo/plugins/scanlines/index.ts"), "utf8");

type Uniforms = Record<"uAmount" | "uSpacing" | "uOffset" | "uReachAll", { value: number }>;

/** The pass for content values at a pixel ratio, and its uniforms */
const build = (data: PassData, pixelRatio = 2): { pass: PostPass; uniforms: Uniforms } => {
  const registration = passRegistration("scanLines")!;
  const pass = registration.factory(passContext(registration, data, new Vector2(300, 200), pixelRatio));
  return { pass, uniforms: (pass as unknown as { material: ShaderMaterial }).material.uniforms as unknown as Uniforms };
};

const draws: unknown[] = [];
const renderer = { setRenderTarget: () => undefined, clear: () => undefined, render: (object: unknown) => { draws.push(object); } };
const frame = (pass: PostPass, delta: number) => pass.render(renderer as never, {} as never, { texture: null } as never, delta, false);

beforeEach(async () => {
  const result = await transpilePlugin(SCANLINES, "scanlines");
  if ("error" in result) throw new Error(result.error.message);
  const body = `${result.code.replace(/^export const register\b/m, "const register")}\nreturn register;`;
  installPlugin("scanlines", { register: new Function(body)() } as PluginModule);
  draws.length = 0;
});

afterEach(() => installedPlugins().forEach(uninstallPlugin));

describe("the scan lines (#216)", () => {
  it("registers scanLines with its rows: line spacing, strength, scroll speed, reach", () => {
    const registration = passRegistration("scanLines")!;
    expect(registration.owner).toBe("scanlines");
    const { params } = registration.spec;
    expect(Object.keys(params)).toEqual(["spacing", "amount", "speed", "reach"]);
    expect(params.spacing).toMatchObject({ kind: "number", default: 3, min: 2, max: 16, unit: "px", label: "line spacing" });
    expect(params.amount).toMatchObject({ kind: "number", default: 0.3, min: 0, max: 1, label: "strength" });
    expect(params.speed).toMatchObject({ kind: "number", default: 6, min: 0, unit: "px/s", label: "scroll speed" });
    expect(params.reach).toMatchObject({ kind: "choice", options: ["all", "ar"], default: "all" });
  });

  it("takes its parameters in device pixels and new values in place", () => {
    const { pass, uniforms } = build({ type: "scanLines", spacing: 4 });
    expect(uniforms.uSpacing.value).toBe(8);
    expect(uniforms.uAmount.value).toBe(0.3);
    expect(uniforms.uReachAll.value).toBe(1);
    expect((pass as unknown as { material: ShaderMaterial }).material.fragmentShader).toContain("c.a * (1.0 - v) + v");
    pass.update!({ spacing: 3, amount: 0.5, speed: 6, reach: "ar" });
    expect(uniforms.uSpacing.value).toBe(6);
    expect(uniforms.uAmount.value).toBe(0.5);
    expect(uniforms.uReachAll.value).toBe(0);
  });

  it("scrolls by the seconds the chain hands it, wrapped at one spacing; speed 0 stands still", () => {
    const { pass, uniforms } = build({ type: "scanLines", spacing: 4 }); // 8 device px, 12 device px a second
    frame(pass, 0.25);
    expect(uniforms.uOffset.value).toBeCloseTo(3);
    frame(pass, 0.5);
    expect(uniforms.uOffset.value).toBeCloseTo(1); // 3 + 6, past 8
    expect(draws).toHaveLength(2);
    pass.update!({ spacing: 4, amount: 0.3, speed: 0, reach: "all" });
    frame(pass, 1);
    expect(uniforms.uOffset.value).toBeCloseTo(1);
  });

  it("switched off in the content (as on the demo's The switch) it is not built; on, it is", () => {
    const chain = new PostChain({ getSize: () => new Vector2(300, 200), getPixelRatio: () => 1, capabilities: { maxSamples: 0 } } as never, new Scene(), new PerspectiveCamera());
    const instances = () => (chain as unknown as { instances: { data: PassData }[] }).instances.map(i => i.data.type);
    chain.set([{ type: "scanLines", enabled: false, spacing: 4 }]);
    expect(instances()).toEqual([]);
    chain.set([{ type: "scanLines", spacing: 4 }]);
    expect(instances()).toEqual(["scanLines"]);
    chain.dispose();
  });
});
