import { Group, type Object3D, Texture, WebGLCubeRenderTarget, type WebGLRenderer } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentAssets, type EnvironmentLoaders } from "../look-around/environment-assets";

const BASE = { world: "cafe", onionSky: true } as const;

/** Loaders that resolve when the test says so, and a bake that records what it was given (no WebGL here) */
const fakes = () => {
  const pending = new Map<string, { resolve: (value: Texture | Object3D) => void; reject: (error: Error) => void }>();
  const loaders: EnvironmentLoaders = {
    sky: url => new Promise((resolve, reject) => pending.set(url, { resolve: value => resolve(value as Texture), reject })),
    world: url => new Promise((resolve, reject) => pending.set(url, { resolve: value => resolve(value as Object3D), reject })),
  };
  const baked: Array<{ world: Object3D; sky: Texture | null; target: WebGLCubeRenderTarget }> = [];
  const bake = (world: Object3D, sky: Texture | null) => {
    const target = new WebGLCubeRenderTarget(1);
    baked.push({ world, sky, target });
    return target;
  };
  const assets = new EnvironmentAssets(null as unknown as WebGLRenderer, loaders, bake);
  const changes = vi.fn();
  assets.onChange = changes;
  const settle = async (url: string, value: Texture | Object3D) => {
    pending.get(url)!.resolve(value);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { assets, pending, baked, changes, settle };
};

afterEach(() => vi.restoreAllMocks());

// The environment's assets (content schema 2.10): the sky image and the world model baked into a cube for the pass
describe("EnvironmentAssets", () => {
  it("loads nothing for a book without assets – the built-in world is drawn", async () => {
    const { assets, pending, changes } = fakes();
    await assets.set(BASE);
    expect(pending.size).toBe(0);
    expect(assets.sky).toBeNull();
    expect(assets.world).toBeNull();
    expect(changes).not.toHaveBeenCalled();
  });

  it("loads the sky once and keeps it while the environment names it", async () => {
    const { assets, pending, changes, settle } = fakes();
    const sky = new Texture();
    void assets.set({ ...BASE, skySrc: "https://cdn.example/sky.jpg" });
    expect([...pending.keys()]).toEqual(["https://cdn.example/sky.jpg"]);
    await settle("https://cdn.example/sky.jpg", sky);
    expect(assets.sky).toBe(sky);
    expect(changes).toHaveBeenCalledTimes(1);
    pending.clear();
    void assets.set({ ...BASE, onionSky: false, skySrc: "https://cdn.example/sky.jpg" });
    expect(pending.size).toBe(0);
  });

  it("bakes the world model with the sky, and again when the sky arrives later", async () => {
    const { assets, baked, settle } = fakes();
    const world = new Group();
    const sky = new Texture();
    void assets.set({ ...BASE, worldSrc: "https://cdn.example/world.glb", skySrc: "https://cdn.example/sky.jpg" });
    await settle("https://cdn.example/world.glb", world);
    expect(baked).toHaveLength(1);
    expect(baked[0].world).toBe(world);
    expect(baked[0].sky).toBeNull();
    expect(assets.world).toBe(baked[0].target.texture);
    await settle("https://cdn.example/sky.jpg", sky);
    expect(baked).toHaveLength(2);
    expect(baked[1].sky).toBe(sky);
    expect(assets.world).toBe(baked[1].target.texture);
  });

  it("drops an asset the environment no longer names, and a load a newer environment overtook", async () => {
    const { assets, settle } = fakes();
    const first = new Texture();
    const second = new Texture();
    const disposed = vi.spyOn(first, "dispose");
    void assets.set({ ...BASE, skySrc: "https://cdn.example/a.jpg" });
    void assets.set({ ...BASE, skySrc: "https://cdn.example/b.jpg" });
    await settle("https://cdn.example/a.jpg", first);
    expect(assets.sky).toBeNull();
    expect(disposed).toHaveBeenCalled();
    await settle("https://cdn.example/b.jpg", second);
    expect(assets.sky).toBe(second);
    const removed = vi.spyOn(second, "dispose");
    void assets.set(BASE);
    expect(assets.sky).toBeNull();
    expect(removed).toHaveBeenCalled();
  });

  it("keeps the built-in world when an asset fails", async () => {
    const { assets, pending } = fakes();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loading = assets.set({ ...BASE, worldSrc: "https://cdn.example/broken.glb" });
    pending.get("https://cdn.example/broken.glb")!.reject(new Error("404"));
    await loading;
    expect(assets.world).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
