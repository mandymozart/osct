import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Matrix4, Object3D, PerspectiveCamera, Vector3, Vector4, type Mesh } from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeTypeSpec, type EntityData, type Target } from "@engine/types";
import { installedPlugins, installPlugin, type PluginModule, uninstallPlugin } from "@engine/scene/plugins";
import { buildEntity, type EntityInstance } from "@engine/scene/entities";
import { transpilePlugin } from "../compile";

/**
 * The demo aquarium's WebGPU fluid (#228), the parts that run without a GPU: the choice of the water (the fallback here –
 * unit tests have no WebGPU), the simulation domain scaled to the tank and the camera hand-off. Reached through the
 * built tank's `userData.splash` – the plugin's only export is `register`.
 */

const AQUARIUM = readFileSync(resolve(process.cwd(), "../fixtures/demo/plugins/aquarium/index.ts"), "utf8");

type FluidPath = "webgpu" | "heightfield" | "still";
interface Domain {
  scale: number;
  size: [number, number, number];
  grid: [number, number, number];
  origin: [number, number, number];
  level: number;
  count: number;
}
interface SplashCamera {
  view: Matrix4;
  invView: Matrix4;
  projection: Matrix4;
  invProjection: Matrix4;
}
interface Splash {
  domain: Domain;
  path(): FluidPath;
  fluidPath(state: { webgpu: boolean; gpu: "missing" | "pending" | "ready" | "failed"; material: boolean; simulate: boolean }): FluidPath;
  particles(): Float32Array;
  cells(x: number, y: number, z: number): number[];
  camera(cameraInverse: Matrix4, projection: Matrix4, tankWorld: Matrix4): SplashCamera;
}

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });

const build = (params: Record<string, unknown> = {}): { built: EntityInstance; splash: Splash } => {
  const built = buildEntity(target({ type: "aquarium", assets: [], params: { fish: 0, ...params } }), () => undefined)!;
  let splash: Splash | undefined;
  built.object.traverse(child => { if (child.userData.splash) splash = child.userData.splash as Splash; });
  return { built, splash: splash! };
};

/** The water mesh: the one mesh without `keepMaterial` */
const waterOf = (built: EntityInstance): Mesh => {
  let water: Mesh | undefined;
  built.object.traverse(child => { if ((child as Mesh).isMesh && !child.userData.keepMaterial) water = child as Mesh; });
  return water!;
};

beforeEach(async () => {
  const result = await transpilePlugin(AQUARIUM, "aquarium");
  if ("error" in result) throw new Error(result.error.message);
  const body = `${result.code.replace(/^export const register\b/m, "const register")}\nreturn register;`;
  installPlugin("aquarium", { register: new Function(body)() } as PluginModule);
});

afterEach(() => installedPlugins().forEach(uninstallPlugin));

describe("the aquarium's water: the fluid or the heightfield (#228)", () => {
  it("runs the WebGPU fluid only when the node wants it, its WebGPU is ready and the water composites it", () => {
    const { splash } = build();
    const state = { webgpu: true, gpu: "ready" as const, material: true, simulate: true };
    expect(splash.fluidPath(state)).toBe("webgpu");
    expect(splash.fluidPath({ ...state, webgpu: false })).toBe("heightfield");
    for (const gpu of ["missing", "pending", "failed"] as const) expect(splash.fluidPath({ ...state, gpu })).toBe("heightfield");
    // Another material on the water cannot show the fluid's picture
    expect(splash.fluidPath({ ...state, material: false })).toBe("heightfield");
    expect(splash.fluidPath({ ...state, gpu: "missing", simulate: false })).toBe("still");
    expect(splash.fluidPath({ ...state, simulate: false })).toBe("webgpu");
  });

  it("falls back to the heightfield without WebGPU – and the Entity panel's row says so", () => {
    const { built, splash } = build();
    built.update!(1 / 60);
    expect(splash.path()).toBe("heightfield");
    // The heightfield's box: the water up to its level, not the whole inside the fluid shows through
    const water = waterOf(built);
    water.geometry.computeBoundingBox();
    expect(water.geometry.boundingBox!.max.y * 2).toBeCloseTo(0.45 * 0.85 - 0.004, 5);
    const row = nodeTypeSpec("aquarium")!.params.webgpu as { label?: string; default: unknown };
    expect([row.default, row.label]).toEqual([true, "no WebGPU"]);
    expect(build({ webgpu: false }).splash.path()).toBe("heightfield");
    const still = build({ simulate: false });
    still.built.update!(1 / 60);
    expect(still.splash.path()).toBe("still");
  });

  it("keeps the fluid's parameters with the node type and rebuilds the tank for a new count or render scale", () => {
    const { built } = build();
    const node = (params: Record<string, unknown>): EntityData => ({ type: "aquarium", assets: [], params: { fish: 0, ...params } });
    expect(built.tune?.(node({ fluidColour: "#ff0000" }))).toBe(true);
    expect(built.tune?.(node({ particles: "40k" }))).toBe(false);
    expect(built.tune?.(node({ renderScale: "1" }))).toBe(false);
    expect(built.tune?.(node({ webgpu: false }))).toBe(false);
  });
});

describe("the simulation domain (#228)", () => {
  it("is the tank's inside in cells: the particle count fills the water to its level, more particles a finer grid", () => {
    const counts = ["10k", "20k", "40k"].map(particles => build({ particles }).splash.domain);
    const [small, medium, large] = counts;
    counts.forEach((domain, i) => expect(domain.count).toBe([10_000, 20_000, 40_000][i]));
    // Twice the particles in the same water: the cell is 2^(1/3) smaller
    expect(medium.scale / small.scale).toBeCloseTo(Math.cbrt(2), 5);
    expect(large.scale / medium.scale).toBeCloseTo(Math.cbrt(2), 5);
    // The water's level in cells is the tank's level at the scale; the grid holds the walls
    expect(medium.level).toBeCloseTo((0.45 * 0.85 - 0.004) * medium.scale, 5);
    medium.grid.forEach((cells, axis) => expect(cells).toBe(Math.ceil(medium.size[axis])));
    // The domain is the inside (to the glass top) with 3 cells of grid around it: the walls are the glass
    expect(medium.size[0]).toBeCloseTo((0.7 - 0.008) * medium.scale + 6, 5);
    expect(medium.size[1]).toBeCloseTo((0.45 - 0.004) * medium.scale + 6, 5);
    expect(medium.size[0] / medium.size[2]).toBeGreaterThan(1.5);
  });

  it("follows the tank's shape: a deep, narrow tank has a deep, narrow domain", () => {
    const { domain } = build({ width: 0.3, depth: 0.8, height: 0.9 }).splash;
    expect(domain.size[2]).toBeGreaterThan(domain.size[0] * 2);
    expect(domain.size[1]).toBeGreaterThan(domain.size[0] * 2);
    expect(domain.origin).toEqual([-(0.3 - 0.008) / 2, 0.002, -(0.8 - 0.008) / 2]);
  });

  it("places the particles at rest inside the walls, from the floor up to about the level", () => {
    const { splash } = build();
    const { domain } = splash;
    const particles = splash.particles();
    expect(particles.length).toBe(domain.count * 20);
    let top = 0;
    for (let n = 0; n < domain.count; n++) {
      const [x, y, z] = particles.subarray(n * 20, n * 20 + 3);
      // The inside is the domain less 3 cells all round: the particles keep 0.3 cells off its walls and its floor
      expect(Math.min(x - 3, domain.size[0] - 3 - x, z - 3, domain.size[2] - 3 - z, y - 3)).toBeGreaterThanOrEqual(0.29);
      top = Math.max(top, y);
    }
    // The top layer: the water's level above the inside's floor (in cells), within a layer
    const floor = splash.cells(0, domain.origin[1], 0)[1];
    expect(Math.abs(top - (floor + domain.level))).toBeLessThan(1.5);
  });

  it("maps the tank's points to cells: one tank unit is `scale` cells", () => {
    const { splash } = build();
    const a = splash.cells(0, 0.1, 0);
    const b = splash.cells(0.2, 0.3, -0.1);
    expect(b[0] - a[0]).toBeCloseTo(0.2 * splash.domain.scale, 4);
    expect(b[1] - a[1]).toBeCloseTo(0.2 * splash.domain.scale, 4);
    expect(b[2] - a[2]).toBeCloseTo(-0.1 * splash.domain.scale, 4);
  });
});

describe("the camera hand-off (#228)", () => {
  /** A tank stood on a page somewhere in the scene, seen by a camera off to the side */
  const scene = () => {
    const page = new Object3D();
    page.position.set(0.4, -0.2, 0.1);
    page.rotation.set(-Math.PI / 2, 0, 0.3);
    page.scale.setScalar(1.7);
    const tank = new Object3D();
    tank.rotation.set(Math.PI / 2, 0, 0);
    page.add(tank);
    page.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(50, 640 / 760, 0.01, 50);
    camera.position.set(1.2, 0.9, 1.6);
    camera.lookAt(0.4, -0.1, 0.1);
    camera.updateMatrixWorld(true);
    return { tank, camera };
  };

  /** NDC of a point through a matrix chain */
  const ndc = (m: Matrix4, p: Vector3) => {
    const v = new Vector4(p.x, p.y, p.z, 1).applyMatrix4(m);
    return new Vector3(v.x / v.w, v.y / v.w, v.z / v.w);
  };

  it("draws every point of the tank where the scene's camera sees it, its depth in WebGPU's 0…1", () => {
    const { splash } = build();
    const { tank, camera } = scene();
    const hand = splash.camera(camera.matrixWorldInverse, camera.projectionMatrix, tank.matrixWorld);
    const three = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(tank.matrixWorld);
    const gpu = new Matrix4().multiplyMatrices(hand.projection, hand.view);
    for (const point of [[0, 0.1, 0], [-0.3, 0.002, -0.18], [0.3, 0.4, 0.18], [0.05, 0.38, -0.1]]) {
      const local = new Vector3(...point);
      const seen = ndc(three, local);
      const cells = new Vector3(...splash.cells(local.x, local.y, local.z));
      const drawn = ndc(gpu, cells);
      expect(drawn.x).toBeCloseTo(seen.x, 4);
      expect(drawn.y).toBeCloseTo(seen.y, 4);
      expect(drawn.z).toBeCloseTo((seen.z + 1) / 2, 4);
      expect(drawn.z).toBeGreaterThan(0);
      expect(drawn.z).toBeLessThan(1);
    }
  });

  it("keeps Splash's unit: the view is rigid in cells, so the filter's thresholds and the particles' size hold", () => {
    const { splash } = build();
    const { tank, camera } = scene();
    const { view, invView, projection, invProjection } = splash.camera(camera.matrixWorldInverse, camera.projectionMatrix, tank.matrixWorld);
    const a = new Vector3(3, 4, 5);
    const b = new Vector3(10, 2, 7);
    expect(a.clone().applyMatrix4(view).distanceTo(b.clone().applyMatrix4(view))).toBeCloseTo(a.distanceTo(b), 4);
    new Matrix4().multiplyMatrices(invView, view).elements.forEach((e, i) => expect(e).toBeCloseTo(new Matrix4().elements[i], 5));
    new Matrix4().multiplyMatrices(invProjection, projection).elements.forEach((e, i) => expect(e).toBeCloseTo(new Matrix4().elements[i], 4));
  });

  it("lets Splash's shaders rebuild a view point from its depth (the fluid's normals and the filter need it)", () => {
    const { splash } = build();
    const { tank, camera } = scene();
    const { view, projection, invProjection } = splash.camera(camera.matrixWorldInverse, camera.projectionMatrix, tank.matrixWorld);
    const viewPoint = new Vector3(...splash.cells(0.05, 0.2, 0.02)).applyMatrix4(view);
    const clip = new Vector4(viewPoint.x, viewPoint.y, viewPoint.z, 1).applyMatrix4(projection);
    const uv = [(clip.x / clip.w + 1) / 2, (1 - clip.y / clip.w) / 2];
    // computeViewPosFromUVDepth: ndc.z from the depth through the projection's z row, then the inverse projection
    const e = projection.elements;
    const depth = -viewPoint.z;
    const ndcZ = -e[10] + e[14] / depth;
    const eye = new Vector4(uv[0] * 2 - 1, 1 - 2 * uv[1], ndcZ, 1).applyMatrix4(invProjection);
    expect(eye.x / eye.w).toBeCloseTo(viewPoint.x, 3);
    expect(eye.y / eye.w).toBeCloseTo(viewPoint.y, 3);
    expect(eye.z / eye.w).toBeCloseTo(viewPoint.z, 3);
  });
});
