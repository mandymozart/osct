import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreloaderService } from "@/services/PreloaderService";
import { getAssets, getSpread, getSpreads } from "@/utils/game-config";

describe("PreloaderService", () => {
  const spreads = getSpreads();
  let preloader: PreloaderService;
  let fetchMock: ReturnType<typeof vi.fn<[string, RequestInit?], Promise<Response>>>;

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
    [...getAssets(spreadId).map(a => a.src), ...getSpread(spreadId)!.entries.map(e => e.image)]
      .filter((src): src is string => !!src && !/^https?:\/\//.test(src));

  it("preloads the neighbouring spreads (.mind first, then their content), never the active one", async () => {
    await preloader.preloadNeighbours(spreads[1].id);
    const urls = fetchedUrls();

    expect(urls.slice(0, 2)).toEqual([spreads[0].mindSrc, spreads[2].mindSrc]);
    expect(new Set(urls.slice(2))).toEqual(new Set([...contentOf(spreads[0].id), ...contentOf(spreads[2].id)]));
    expect(urls).not.toContain(spreads[1].mindSrc);
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
    expect(fetchedUrls()[0]).toBe(spreads[1].mindSrc);
    expect(fetchedUrls()).not.toContain(spreads[2].mindSrc);
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
});
