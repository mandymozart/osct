import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Box3, type Mesh, Scene, type ShaderMaterial, type Vector4, type WebGLRenderTarget } from "three";
import type { EntityData, Target } from "@engine/types";
import { installedPlugins, installPlugin, type PluginModule, uninstallPlugin } from "@engine/scene/plugins";
import { buildEntity, type EntityInstance } from "@engine/scene/entities";
import { feedbackCount, type FeedbackRenderer, stepFeedbacks } from "@engine/scene/feedback";
import { transpilePlugin } from "../compile";

/**
 * The demo's ink painting (#225): the real plugin (`fixtures/demo/plugins/fluid`) with the engine's feedback buffers,
 * stepped by a renderer that records instead of drawing (no WebGL in the tests).
 */

const FLUID = readFileSync(resolve(process.cwd(), "../fixtures/demo/plugins/fluid/index.ts"), "utf8");

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });
const node = (params: Record<string, unknown> = {}): EntityData => ({ type: "inkPainting", assets: [], params });

interface Draw { target: WebGLRenderTarget | null; material: ShaderMaterial }
const recorder = () => {
  let bound: WebGLRenderTarget | null = null;
  const draws: Draw[] = [];
  const renderer: FeedbackRenderer = {
    extensions: { has: name => name === "EXT_color_buffer_float" || name === "OES_texture_float_linear" },
    setRenderTarget: next => { bound = next as WebGLRenderTarget | null; },
    getRenderTarget: () => bound,
    render: object => { draws.push({ target: bound, material: (object as Mesh).material as ShaderMaterial }); },
  };
  return { renderer, draws };
};

/** The painting on a found page: built and put into a scene */
const place = (params: Record<string, unknown> = {}): { built: EntityInstance; canvas: Mesh } => {
  const built = buildEntity(target(node(params)), () => undefined)!;
  new Scene().add(built.object);
  let canvas: Mesh | undefined;
  built.object.traverse(child => { if ((child as Mesh).isMesh && ((child as Mesh).material as ShaderMaterial).uniforms?.picture) canvas = child as Mesh; });
  return { built, canvas: canvas! };
};

beforeEach(async () => {
  const result = await transpilePlugin(FLUID, "fluid");
  if ("error" in result) throw new Error(result.error.message);
  const body = `${result.code.replace(/^export const register\b/m, "const register")}\nreturn register;`;
  installPlugin("fluid", { register: new Function(body)() } as PluginModule);
});

afterEach(() => installedPlugins().forEach(uninstallPlugin));

describe("the ink painting (#225)", () => {
  it("steps Buffer A (float, reading itself) and then the Image pass (8 bits, reading Buffer A) the canvas shows", () => {
    const { built, canvas } = place();
    const { renderer, draws } = recorder();
    stepFeedbacks(renderer, 1 / 60);
    expect(draws).toHaveLength(2);
    const [a, image] = draws;
    expect(a.material.fragmentShader).toContain("semi-Langrangian advection");
    expect(a.material.fragmentShader).toContain("mainImage(shadertoyColor, vUv * iResolution.xy)");
    expect(a.target!.texture.type).toBe(1015); // FloatType
    expect(a.target!.width).toBe(256);
    expect(image.material.fragmentShader).toContain("// velocity");
    expect(image.material.uniforms.iChannel0.value).toBe(a.target!.texture); // Buffer A's new frame
    expect(image.target!.texture.type).toBe(1009); // UnsignedByteType
    expect((canvas.material as ShaderMaterial).uniforms.picture.value).toBe(image.target!.texture);
    built.dispose?.();
    expect(feedbackCount()).toBe(0);
  });

  it("stands on the page: its lowest point at y = 0", () => {
    const { built } = place();
    const box = new Box3().setFromObject(built.object);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeCloseTo(0.8, 3);
    built.dispose?.();
  });

  it("a tap stirs: a swirl at a point of the canvas, fading within a second; the pen's clock follows its speed", () => {
    const { built } = place({ penSpeed: 2 });
    const { renderer, draws } = recorder();
    stepFeedbacks(renderer, 1 / 60);
    const uniforms = draws[0].material.uniforms;
    const stir = uniforms.stir.value as Vector4;
    expect(stir.z).toBe(0);
    built.onTap?.(); // no pointer press: a random spot in the middle half
    expect(stir.z).toBe(1);
    expect(stir.x).toBeGreaterThanOrEqual(64);
    expect(stir.x).toBeLessThanOrEqual(192);
    built.update?.(0.5);
    expect(stir.z).toBeLessThan(0.3);
    expect(uniforms.penTime.value).toBeCloseTo(1, 5);
    built.dispose?.();
  });

  it("pen speed and dissipation apply in place; another resolution builds it anew at 512", () => {
    const { built } = place();
    const { renderer, draws } = recorder();
    stepFeedbacks(renderer, 1 / 60);
    expect(built.tune?.(node({ penSpeed: 3, dissipation: 50 }))).toBe(true);
    expect(draws[0].material.uniforms.penSpeed.value).toBe(3);
    expect(draws[0].material.uniforms.dissipation.value).toBe(50);
    expect(built.tune?.(node({ resolution: "512" }))).toBe(false);
    built.dispose?.();
    const fine = place({ resolution: "512" });
    stepFeedbacks(renderer, 1 / 60);
    expect(draws[2].target!.width).toBe(512);
    fine.built.dispose?.();
  });

  it("pauses while its page is not found (the anchor hidden)", () => {
    const { built } = place();
    const { renderer, draws } = recorder();
    built.object.parent!.visible = false;
    stepFeedbacks(renderer, 1 / 60);
    expect(draws).toHaveLength(0);
    built.dispose?.();
  });
});
