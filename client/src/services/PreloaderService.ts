import { LoadOptions, LoadResult } from "@/types";
import { getAssets, getSpread, getSpreads } from "@/utils/game-config";

const DEFAULT_TIMEOUT = 30000;

/** Only our own files: external URLs (links, embeds) are cross-origin and not ours to cache */
const isLocal = (src?: string): src is string => !!src && !/^[a-z]+:\/\//i.test(src);

/**
 * Files a spread shows besides its `.mind`: entity assets (AR: models, images, audio, videos) and
 * entry images (consultation). Videos last – they are the largest.
 */
const getSpreadContent = (spreadId: string): LoadOptions[] => {
  const assets: LoadOptions[] = getAssets(spreadId)
    .filter(a => isLocal(a.src))
    .map(a => ({ src: a.src, type: a.assetType }));
  const images: LoadOptions[] = (getSpread(spreadId)?.entries ?? [])
    .map(e => e.image)
    .filter(isLocal)
    .map(src => ({ src, type: "image" }));
  const isVideo = (o: LoadOptions) => o.type === "video";
  return [...assets.filter(o => !isVideo(o)), ...images, ...assets.filter(isVideo)];
};

/**
 * Preloads files into the browser (HTTP) cache only (RULES #4): a plain fetch whose body is read and
 * dropped, so the later request by MindAR/A-Frame for the same URL is served from the cache.
 * Never touches the A-Frame scene. One request per URL; failed ones may be retried later.
 */
export class PreloaderService {
  private static instance: PreloaderService | null = null;
  private loads = new Map<string, Promise<LoadResult>>();
  private done = new Set<string>();

  static getInstance(): PreloaderService {
    if (!PreloaderService.instance) PreloaderService.instance = new PreloaderService();
    return PreloaderService.instance;
  }

  preload({ src, timeout = DEFAULT_TIMEOUT }: LoadOptions): Promise<LoadResult> {
    const running = this.loads.get(src);
    if (running) return running;

    const load = this.fetchIntoCache(src, timeout).then(result => {
      if (result.success) this.done.add(src);
      else this.loads.delete(src); // allow a retry
      return result;
    });
    this.loads.set(src, load);
    return load;
  }

  isPreloaded(src: string): boolean {
    return this.done.has(src);
  }

  /**
   * Content of the spreads next to `spreadId` in book order (the ones the spread menu reaches next).
   * Not all spreads: each `.mind` alone is ~1 MB and the book has many spreads.
   * Per spread: `.mind` first (needed to start AR), then entity assets and entry images.
   */
  async preloadNeighbours(spreadId: string, range = 1): Promise<LoadResult[]> {
    const spreads = getSpreads();
    const index = spreads.findIndex(s => s.id === spreadId);
    if (index === -1) return [];
    const neighbours = spreads.filter((_, i) => i !== index && Math.abs(i - index) <= range);

    const minds = await Promise.all(neighbours.map(s => this.preload({ src: s.mindSrc, type: "mind" })));
    const content = await Promise.all(neighbours.flatMap(s => getSpreadContent(s.id)).map(options => this.preload(options)));
    return [...minds, ...content];
  }

  private async fetchIntoCache(src: string, timeout: number): Promise<LoadResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(src, { signal: controller.signal, priority: "low" } as RequestInit);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      await response.arrayBuffer(); // the body has to be read for the response to be cached
      return { success: true };
    } catch (error) {
      console.warn(`[PreloaderService] Failed to preload ${src}:`, error);
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    } finally {
      clearTimeout(timer);
    }
  }
}
