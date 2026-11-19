import { Texture, type WebGLRenderer } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentAssets, type EnvironmentLoaders } from "../look-around/environment-assets";

const BASE = { world: "cafe", onionSky: true } as const;

/** A sky loader that resolves when the test says so (no WebGL here) */
const fakes = () => {
  const pending = new Map<string, { resolve: (value: Texture) => void; reject: (error: Error) => void }>();
  const loaders: EnvironmentLoaders = {
    sky: url => new Promise((resolve, reject) => pending.set(url, { resolve, reject })),
  };
  const assets = new EnvironmentAssets(null as unknown as WebGLRenderer, loaders);
  const changes = vi.fn();
  assets.onChange = changes;
  const settle = async (url: string, value: Texture) => {
    pending.get(url)!.resolve(value);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { assets, pending, changes, settle };
};

afterEach(() => vi.restoreAllMocks());

// The environment's assets: the sky image only – the world is gone (#310)
describe("EnvironmentAssets", () => {
  it("loads nothing for an experience without a sky", async () => {
    const { assets, pending, changes } = fakes();
    await assets.set(BASE);
    expect(pending.size).toBe(0);
    expect(assets.sky).toBeNull();
    expect(assets.world).toBeNull();
    expect(changes).not.toHaveBeenCalled();
  });

  it("ignores a world model the content still names", async () => {
    const { assets, pending } = fakes();
    await assets.set({ ...BASE, worldSrc: "https://cdn.example/world.glb" });
    expect(pending.size).toBe(0);
    expect(assets.world).toBeNull();
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

  it("drops a sky the environment no longer names, and a load a newer environment overtook", async () => {
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

  it("draws no sky when it fails to load", async () => {
    const { assets, pending } = fakes();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loading = assets.set({ ...BASE, skySrc: "https://cdn.example/broken.jpg" });
    pending.get("https://cdn.example/broken.jpg")!.reject(new Error("404"));
    await loading;
    expect(assets.sky).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
