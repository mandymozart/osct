import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EntityData, Target } from "@engine/types";
import { installedPlugins, installPlugin, type PluginModule, uninstallPlugin } from "@engine/scene/plugins";
import { buildEntity, type EntityInstance } from "@engine/scene/entities";
import { transpilePlugin } from "../compile";

/**
 * The demo aquarium's water (#202): the heightfield simulation of the real plugin (`fixtures/demo/plugins/aquarium`),
 * reached through the built tank (`userData.waves`) – the plugin's only export is `register`.
 */

const AQUARIUM = readFileSync(resolve(process.cwd(), "../fixtures/demo/plugins/aquarium/index.ts"), "utf8");

interface Waves {
  cols: number;
  rows: number;
  height: Float32Array;
  velocity: Float32Array;
  step(keep: number): void;
  displace(columns: Float32Array): void;
  volume(): number;
}

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });

const build = (params: Record<string, unknown>): { built: EntityInstance; waves: Waves } => {
  const built = buildEntity(target({ type: "aquarium", assets: [], params: { fish: 0, ...params } }), () => undefined)!;
  let waves: Waves | undefined;
  built.object.traverse(child => { if (child.userData.waves) waves = child.userData.waves as Waves; });
  return { built, waves: waves! };
};

const peak = (values: Float32Array): number => values.reduce((max, v) => Math.max(max, Math.abs(v)), 0);

beforeEach(async () => {
  const result = await transpilePlugin(AQUARIUM, "aquarium");
  if ("error" in result) throw new Error(result.error.message);
  const body = `${result.code.replace(/^export const register\b/m, "const register")}\nreturn register;`;
  installPlugin("aquarium", { register: new Function(body)() } as PluginModule);
});

afterEach(() => installedPlugins().forEach(uninstallPlugin));

describe("the aquarium's heightfield (#202)", () => {
  it("has square cells, the grid along the longer side", () => {
    expect([build({}).waves.cols, build({}).waves.rows]).toEqual([64, 36]);
    const deep = build({ width: 0.4, depth: 0.8, grid: "32" }).waves;
    expect([deep.cols, deep.rows]).toEqual([16, 32]);
  });

  it("a pushed cell spreads to its neighbours, and the ring decays", () => {
    const { waves } = build({ body: "none" });
    const { cols, rows, height } = waves;
    const middle = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    height[middle] = -0.02;
    waves.step(0.99);
    // After one step the neighbours have moved (up: they are pulled towards the dip), the cell came back a little
    expect(height[middle]).toBeGreaterThan(-0.02);
    [middle - 1, middle + 1, middle - cols, middle + cols].forEach(k => expect(height[k]).toBeLessThan(0));
    for (let i = 0; i < 20; i++) waves.step(0.99);
    // A ring: cells five away now move, the middle no longer holds the whole dip
    expect(Math.abs(height[middle + 5])).toBeGreaterThan(1e-5);
    const early = peak(height);
    for (let i = 0; i < 600; i++) waves.step(0.99);
    expect(peak(height)).toBeLessThan(early * 0.1);
  });

  it("the waves keep the water's volume", () => {
    const { waves } = build({ body: "none" });
    waves.height[10] = 0.03;
    waves.height[200] = -0.01;
    const before = waves.volume();
    for (let i = 0; i < 500; i++) waves.step(0.995);
    expect(waves.volume()).toBeCloseTo(before, 5);
  });

  it("the toy displaces its volume going in and gives it back rising: the surface is flat again once it settled", () => {
    const { built, waves } = build({ body: "ball", period: 4, dip: 0.04, damping: 2 });
    let deepest = 0;
    // One loop at 60 frames per second: in, out
    for (let frame = 0; frame < 240; frame++) {
      built.update!(1 / 60);
      deepest = Math.min(deepest, ...waves.height);
      expect(Math.abs(waves.volume())).toBeLessThan(1e-3);
    }
    expect(deepest).toBeLessThan(-0.005);
    // Hold above the water (no loop) and let it settle
    built.tune?.({ type: "aquarium", assets: [], params: { fish: 0, body: "ball", period: 0, dip: 0.04, damping: 2 } });
    for (let frame = 0; frame < 900; frame++) built.update!(1 / 60);
    expect(peak(waves.height)).toBeLessThan(5e-4);
  });

  it("a tap pushes the toy in once – without a loop the water only moves after it", () => {
    const { built, waves } = build({ body: "fish", period: 0 });
    for (let frame = 0; frame < 30; frame++) built.update!(1 / 60);
    expect(peak(waves.height)).toBe(0);
    built.onTap?.();
    for (let frame = 0; frame < 30; frame++) built.update!(1 / 60);
    expect(peak(waves.height)).toBeGreaterThan(1e-3);
  });

  it("without the simulation the surface stays still (the water keeps its static waves)", () => {
    const { built, waves } = build({ body: "ball", simulate: false });
    for (let frame = 0; frame < 120; frame++) built.update!(1 / 60);
    expect(peak(waves.height)).toBe(0);
  });
});
