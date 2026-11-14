import { afterEach, describe, expect, it, vi } from "vitest";
import { Group } from "three";
import { installedPlugins, installPlugin, loadModel, type PluginApi, type PluginModel, uninstallPlugin } from "../plugins";

/** A model file – the value of a `model` parameter – by its URL, one request per URL (#263) */

const model = (): PluginModel => ({ scene: new Group(), animations: [] });

afterEach(() => installedPlugins().forEach(uninstallPlugin));

describe("loadModel", () => {
  it("loads a file once however often it is asked for, and hands everyone the same model", async () => {
    const loader = vi.fn(async () => model());
    const url = "https://cdn.example/assets/book/one/v1.glb";
    const [a, b] = await Promise.all([loadModel(url, loader), loadModel(url, loader)]);
    expect(b).toBe(a);
    expect(await loadModel(url, loader)).toBe(a);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(url, "glb");
  });

  it("tells a .gltf from a .glb, whatever follows the file's name", async () => {
    const loader = vi.fn(async () => model());
    await loadModel("https://cdn.example/assets/book/two/v2.gltf?v=3", loader);
    expect(loader).toHaveBeenCalledWith("https://cdn.example/assets/book/two/v2.gltf?v=3", "gltf");
  });

  it("rejects a failed load and asks again next time", async () => {
    const url = "https://cdn.example/assets/book/three/v1.glb";
    const failing = vi.fn(async () => { throw new Error("404 Not Found"); });
    await expect(loadModel(url, failing)).rejects.toThrow("404 Not Found");
    const loader = vi.fn(async () => model());
    await expect(loadModel(url, loader)).resolves.toMatchObject({ animations: [] });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("rejects what is no model file without asking for it", async () => {
    const loader = vi.fn(async () => model());
    await expect(loadModel("https://cdn.example/assets/book/four/v1.jpg", loader)).rejects.toThrow(/a model is a \.glb or \.gltf file/);
    await expect(loadModel("", loader)).rejects.toThrow(/no file/);
    expect(loader).not.toHaveBeenCalled();
  });

  it("is on the plugin's api", () => {
    let api: PluginApi | undefined;
    installPlugin("papers", { register: (given: PluginApi) => { api = given; } });
    expect(typeof api?.loadModel).toBe("function");
  });
});
