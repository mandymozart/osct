import { afterEach, describe, expect, it, vi } from "vitest";
import { installedPlugins, installPlugin, loadText, type PluginApi, uninstallPlugin } from "../plugins";

/** Plugin API 1.5 (#186): a text file – a Library shader – by its URL, one request per URL */

const ok = (text: string) => new Response(text, { status: 200 });

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.restoreAllMocks();
});

describe("loadText", () => {
  it("fetches a file once however often it is asked for", async () => {
    const fetcher = vi.fn(async () => ok("void main() {}"));
    const url = "https://cdn.example/assets/book/one/v1.frag";
    const [a, b] = await Promise.all([loadText(url, fetcher), loadText(url, fetcher)]);
    expect(a).toBe("void main() {}");
    expect(b).toBe(a);
    expect(await loadText(url, fetcher)).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects on an HTTP error and asks again next time", async () => {
    const url = "https://cdn.example/assets/book/two/v1.glsl";
    const failing = vi.fn(async () => new Response("", { status: 404, statusText: "Not Found" }));
    await expect(loadText(url, failing)).rejects.toThrow(/404 Not Found .*v1\.glsl/);
    const fetcher = vi.fn(async () => ok("// found"));
    expect(await loadText(url, fetcher)).toBe("// found");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("is on the plugin's api", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok("@fragment fn main() {}")));
    let loading: Promise<string> | undefined;
    installPlugin("shaders", { register: (api: PluginApi) => { loading = api.loadText("https://cdn.example/assets/book/three/v1.wgsl"); } });
    expect(await loading).toBe("@fragment fn main() {}");
    vi.unstubAllGlobals();
  });
});
