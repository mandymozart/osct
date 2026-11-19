import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi, type Mock } from "vitest";
import { PreloaderService } from "@/services/PreloaderService";
import { getAssets, getScene, getScenes, getTargets } from "@/utils/game-config";
import { compressedUrl } from "@/utils/compressed"; // .glb
import { targetWithVideo } from "@/test/content-fixtures";

describe("PreloaderService", () => {
  const scenes = getScenes();
  let preloader: PreloaderService;
  let fetchMock: Mock<(url: string, init?: RequestInit) => Promise<Response>>;

  beforeEach(() => {
    preloader = new PreloaderService();
    fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new ArrayBuffer(8), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fetchedUrls = () => fetchMock.mock.calls.map(([url]) => url);
  /** A scene's target images – what the tracker needs to start (the preloader fetches them first) */
  const targetsOf = (sceneId: string) => getTargets(sceneId).map(t => t.imageSrc);

  it("fetches a file once, even when asked twice", async () => {
    const src = targetsOf(scenes[0].id)[0];
    await Promise.all([preloader.preload({ src, type: "image" }), preloader.preload({ src, type: "image" })]);
    await preloader.preload({ src, type: "image" });

    expect(fetchedUrls()).toEqual([src]);
    expect(preloader.isPreloaded(src)).toBe(true);
  });

  const contentOf = (sceneId: string) =>
    // models: their gzip copy – the same URL the AR scene loads (utils/compressed.ts)
    [...getAssets(sceneId).map(a => compressedUrl(a.src)), ...getScene(sceneId)!.entries.map(e => e.image)]
      .filter((src): src is string => !!src && !/^https?:\/\//.test(src));

  it("preloads the neighbouring scenes (target images first, then their content), never the active one", async () => {
    await preloader.preloadNeighbours(scenes[1].id);
    const urls = fetchedUrls();
    const targets = [...targetsOf(scenes[0].id), ...targetsOf(scenes[2].id)];

    expect(urls.slice(0, targets.length)).toEqual(targets);
    expect(new Set(urls)).toEqual(new Set([...targets, ...contentOf(scenes[0].id), ...contentOf(scenes[2].id)]));
    expect(urls).not.toContain(targetsOf(scenes[1].id)[0]);
    expect(urls.filter(url => /^https?:\/\//.test(url))).toEqual([]);
  });

  it("preloads a scene's videos after its other content", async () => {
    const { target, restore } = targetWithVideo();
    onTestFinished(restore);
    const scene = scenes.find(s => s.id === target.sceneId)!;
    const neighbour = scenes[scenes.indexOf(scene) - 1] ?? scenes[scenes.indexOf(scene) + 1];
    await preloader.preloadNeighbours(neighbour.id);

    const videos = new Set(getAssets(scene.id).filter(a => a.assetType === "video").map(a => a.src));
    const own = fetchedUrls().filter(url => contentOf(scene.id).includes(url));
    const firstVideo = own.findIndex(url => videos.has(url));
    expect(firstVideo).toBeGreaterThan(-1);
    expect(own.slice(firstVideo).every(url => videos.has(url))).toBe(true);
  });

  it("preloads a window: all its target images first, then the content scene by scene in the given order", async () => {
    const withContent = scenes.filter(s => contentOf(s.id).length && targetsOf(s.id).length).slice(0, 2);
    const window = [withContent[1].id, withContent[0].id];
    await preloader.preloadScenes(window);
    const urls = fetchedUrls();
    const targets = window.flatMap(targetsOf);
    expect(urls.slice(0, targets.length)).toEqual(targets);
    const firstOf = (id: string) => urls.findIndex(url => contentOf(id).includes(url) && !targets.includes(url));
    expect(firstOf(window[0])).toBeLessThan(firstOf(window[1]));
    expect(await new PreloaderService().preloadScenes(["unknown"])).toEqual([]);
  });

  it("handles the first scene and unknown scenes", async () => {
    await preloader.preloadNeighbours(scenes[0].id);
    expect(fetchedUrls()[0]).toBe(targetsOf(scenes[1].id)[0]);
    expect(fetchedUrls()).not.toContain(targetsOf(scenes[2].id)[0]);
    expect(await preloader.preloadNeighbours("unknown")).toEqual([]);
  });

  it("reports a failed request and allows a retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404, statusText: "Not Found" }));
    const src = targetsOf(scenes[0].id)[0];

    const first = await preloader.preload({ src, type: "image" });
    expect(first.success).toBe(false);
    expect(preloader.isPreloaded(src)).toBe(false);

    expect((await preloader.preload({ src, type: "image" })).success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe("whole-book download", () => {
    it("reports the book's size before, then downloads every content file once with progress", async () => {
      const before = await preloader.getExperienceDownload();
      expect(before.state).toBe("idle");
      expect(before.total).toBeGreaterThan(0); // sizes from the build
      expect(before.loaded).toBe(0);

      const states: string[] = [];
      let lastLoaded = 0;
      preloader.onExperienceDownload(d => {
        states.push(d.state);
        expect(d.loaded).toBeGreaterThanOrEqual(lastLoaded); // never goes back
        lastLoaded = d.loaded;
      });
      const [first, second] = await Promise.all([preloader.downloadExperience(), preloader.downloadExperience()]); // one run
      expect(first).toEqual(second);
      expect(first).toMatchObject({ state: "done", loaded: before.total, total: before.total, failed: 0 });
      expect(states[0]).toBe("running");
      expect(states.at(-1)).toBe("done");

      const urls = fetchedUrls();
      expect(new Set(urls).size).toBe(urls.length);
      for (const scene of scenes) for (const src of targetsOf(scene.id)) expect(urls).toContain(src);
      expect((await preloader.getExperienceDownload()).state).toBe("done");
    });

    it("skips what is on the device already and reports failed files", async () => {
      await preloader.preloadScene(scenes[0].id);
      const already = fetchedUrls().length;
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

      const result = await preloader.downloadExperience();
      expect(result).toMatchObject({ state: "failed", failed: 1 });
      expect(result.loaded).toBeLessThan(result.total);
      expect(fetchedUrls().slice(already)).not.toContain(targetsOf(scenes[0].id)[0]);

      expect((await preloader.downloadExperience()).state).toBe("done"); // try again: the rest
    });
  });
});
