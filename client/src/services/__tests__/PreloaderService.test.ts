import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PreloaderService } from "@/services/PreloaderService";
import { getAssets, getSpread, getSpreads } from "@/utils/game-config";
import { compressedUrl as mindUrl } from "@/utils/compressed"; // .mind and .glb

describe("PreloaderService", () => {
  const spreads = getSpreads();
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

  it("fetches a file once, even when asked twice", async () => {
    const src = spreads[0].mindSrc;
    await Promise.all([preloader.preload({ src, type: "mind" }), preloader.preload({ src, type: "mind" })]);
    await preloader.preload({ src, type: "mind" });

    expect(fetchedUrls()).toEqual([src]);
    expect(preloader.isPreloaded(src)).toBe(true);
  });

  const contentOf = (spreadId: string) =>
    // models: their gzip copy – the same URL the AR scene loads (utils/compressed.ts)
    [...getAssets(spreadId).map(a => mindUrl(a.src)), ...getSpread(spreadId)!.entries.map(e => e.image)]
      .filter((src): src is string => !!src && !/^https?:\/\//.test(src));

  it("preloads the neighbouring spreads (.mind first, then their content), never the active one", async () => {
    await preloader.preloadNeighbours(spreads[1].id);
    const urls = fetchedUrls();

    expect(urls.slice(0, 2)).toEqual([mindUrl(spreads[0].mindSrc), mindUrl(spreads[2].mindSrc)]);
    expect(new Set(urls.slice(2))).toEqual(new Set([...contentOf(spreads[0].id), ...contentOf(spreads[2].id)]));
    expect(urls).not.toContain(mindUrl(spreads[1].mindSrc));
    expect(urls.filter(url => /^https?:\/\//.test(url))).toEqual([]);
  });

  it("preloads a spread's videos after its other content", async () => {
    const spread = spreads.find(s => getAssets(s.id).some(a => a.assetType === "video"))!;
    const neighbour = spreads[spreads.indexOf(spread) - 1] ?? spreads[spreads.indexOf(spread) + 1];
    await preloader.preloadNeighbours(neighbour.id);

    const videos = new Set(getAssets(spread.id).filter(a => a.assetType === "video").map(a => a.src));
    const own = fetchedUrls().filter(url => contentOf(spread.id).includes(url));
    const firstVideo = own.findIndex(url => videos.has(url));
    expect(firstVideo).toBeGreaterThan(-1);
    expect(own.slice(firstVideo).every(url => videos.has(url))).toBe(true);
  });

  it("handles the first spread and unknown spreads", async () => {
    await preloader.preloadNeighbours(spreads[0].id);
    expect(fetchedUrls()[0]).toBe(mindUrl(spreads[1].mindSrc));
    expect(fetchedUrls()).not.toContain(mindUrl(spreads[2].mindSrc));
    expect(await preloader.preloadNeighbours("unknown")).toEqual([]);
  });

  it("reports a failed request and allows a retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404, statusText: "Not Found" }));
    const src = spreads[0].mindSrc;

    const first = await preloader.preload({ src, type: "mind" });
    expect(first.success).toBe(false);
    expect(preloader.isPreloaded(src)).toBe(false);

    expect((await preloader.preload({ src, type: "mind" })).success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe("whole-book download", () => {
    it("reports the book's size before, then downloads every content file once with progress", async () => {
      const before = await preloader.getBookDownload();
      expect(before.state).toBe("idle");
      expect(before.total).toBeGreaterThan(0); // sizes from the build
      expect(before.loaded).toBe(0);

      const states: string[] = [];
      let lastLoaded = 0;
      preloader.onBookDownload(d => {
        states.push(d.state);
        expect(d.loaded).toBeGreaterThanOrEqual(lastLoaded); // never goes back
        lastLoaded = d.loaded;
      });
      const [first, second] = await Promise.all([preloader.downloadBook(), preloader.downloadBook()]); // one run
      expect(first).toEqual(second);
      expect(first).toMatchObject({ state: "done", loaded: before.total, total: before.total, failed: 0 });
      expect(states[0]).toBe("running");
      expect(states.at(-1)).toBe("done");

      const urls = fetchedUrls();
      expect(new Set(urls).size).toBe(urls.length);
      for (const spread of spreads) expect(urls).toContain(mindUrl(spread.mindSrc));
      expect((await preloader.getBookDownload()).state).toBe("done");
    });

    it("skips what is on the device already and reports failed files", async () => {
      await preloader.preloadSpread(spreads[0].id);
      const already = fetchedUrls().length;
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

      const result = await preloader.downloadBook();
      expect(result).toMatchObject({ state: "failed", failed: 1 });
      expect(result.loaded).toBeLessThan(result.total);
      expect(fetchedUrls().slice(already)).not.toContain(mindUrl(spreads[0].mindSrc));

      expect((await preloader.downloadBook()).state).toBe("done"); // try again: the rest
    });
  });
});
