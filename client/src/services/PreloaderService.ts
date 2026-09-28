import { LoadOptions, LoadResult } from "@/types";
import { getAssets, getNeighbourSpreads, getSpread, getSpreads } from "@/utils/game-config";
import { compressedUrl } from "@/utils/compressed";

const DEFAULT_TIMEOUT = 30000;
/** Whole-book download: per file (videos on a slow connection) and files at a time */
const BOOK_TIMEOUT = 5 * 60000;
const BOOK_PARALLEL = 3;

/** Whole-book download (Info page): state and bytes – `total` from the file sizes written by the build */
export interface BookDownload {
  state: "idle" | "running" | "done" | "failed";
  loaded: number;
  total: number;
  /** Files that could not be downloaded (state `failed`) */
  failed: number;
}

/** Only our own files: external URLs (links, embeds) are cross-origin and not ours to cache */
const isLocal = (src?: string): src is string => !!src && !/^[a-z]+:\/\//i.test(src);

/**
 * Files a spread shows besides its `.mind`: entity assets (AR: models, images, audio, videos) and
 * entry images (consultation). Videos last – they are the largest.
 */
const getSpreadContent = (spreadId: string): LoadOptions[] => {
  const assets: LoadOptions[] = getAssets(spreadId)
    .filter(a => isLocal(a.src))
    .map(a => ({ src: compressedUrl(a.src), type: a.assetType })); // the same URL the AR scene loads
  const images: LoadOptions[] = (getSpread(spreadId)?.entries ?? [])
    .map(e => e.image)
    .filter(isLocal)
    .map(src => ({ src, type: "image" }));
  const isVideo = (o: LoadOptions) => o.type === "video";
  return [...assets.filter(o => !isVideo(o)), ...images, ...assets.filter(isVideo)];
};

/** Every content file of the book – all spreads' `.mind`, entity assets and entry images – each once */
const getBookContent = (): LoadOptions[] => {
  const seen = new Set<string>();
  return getSpreads()
    .flatMap(s => [{ src: compressedUrl(s.mindSrc), type: "mind" } as LoadOptions, ...getSpreadContent(s.id)])
    .filter(o => !seen.has(o.src) && !!seen.add(o.src));
};

/** Sizes of the content files in bytes by URL (vite.config.js → contentSizes; own chunk, loaded on demand) */
const loadContentSizes = async (): Promise<Record<string, number>> => (await import("virtual:osct-content-sizes")).default;

/**
 * Preloads files into the browser (HTTP) cache only (RULES #4): a plain fetch whose body is read and
 * dropped, so the later request by MindAR / three.js for the same URL is served from the cache.
 * Never touches the AR scene. One request per URL; failed ones may be retried later.
 * In production the service worker keeps what these fetches load (its content cache) – that is also how
 * `downloadBook()` puts the whole book on the device (Tilman 2026-09-27: Info page, with progress).
 */
export class PreloaderService {
  private static instance: PreloaderService | null = null;
  private loads = new Map<string, Promise<LoadResult>>();
  private done = new Set<string>();
  private book: BookDownload = { state: "idle", loaded: 0, total: 0, failed: 0 };
  private bookRun: Promise<BookDownload> | null = null;
  private bookListeners = new Set<(download: BookDownload) => void>();

  static getInstance(): PreloaderService {
    if (!PreloaderService.instance) PreloaderService.instance = new PreloaderService();
    return PreloaderService.instance;
  }

  /** `onBytes`: bytes as they arrive – only when this call starts the request (not for a running one) */
  preload({ src, timeout = DEFAULT_TIMEOUT }: LoadOptions, onBytes?: (bytes: number) => void): Promise<LoadResult> {
    const running = this.loads.get(src);
    if (running) return running;

    const load = this.fetchIntoCache(src, timeout, onBytes).then(result => {
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

  /** One spread: its `.mind` first (needed to start AR), then entity assets and entry images */
  async preloadSpread(spreadId: string): Promise<LoadResult[]> {
    const spread = getSpread(spreadId);
    if (!spread) return [];
    const mind = await this.preload({ src: compressedUrl(spread.mindSrc), type: "mind" });
    const content = await Promise.all(getSpreadContent(spreadId).map(options => this.preload(options)));
    return [mind, ...content];
  }

  /**
   * Content of the spreads next to `spreadId` in book order (the ones the spread menu reaches next).
   * Not all spreads: each `.mind` alone is ~1 MB and the book has many spreads.
   * Per spread: `.mind` first (needed to start AR), then entity assets and entry images.
   */
  async preloadNeighbours(spreadId: string, range = 1): Promise<LoadResult[]> {
    const neighbours = getNeighbourSpreads(spreadId, range);
    const minds = await Promise.all(neighbours.map(s => this.preload({ src: compressedUrl(s.mindSrc), type: "mind" })));
    const content = await Promise.all(neighbours.flatMap(s => getSpreadContent(s.id)).map(options => this.preload(options)));
    return [...minds, ...content];
  }

  /**
   * The whole book's size and how much of it is on this device already (the service worker's cache, or
   * loaded in this session). State `done` when all of it is.
   */
  async getBookDownload(): Promise<BookDownload> {
    if (this.book.state === "running") return { ...this.book };
    const [files, sizes] = [getBookContent(), await loadContentSizes()];
    const stored = await Promise.all(files.map(f => this.isStored(f.src)));
    const total = files.reduce((sum, f) => sum + (sizes[f.src] ?? 0), 0);
    const loaded = files.reduce((sum, f, i) => sum + (stored[i] ? sizes[f.src] ?? 0 : 0), 0);
    const state = stored.every(Boolean) ? "done" : this.book.state === "failed" ? "failed" : "idle";
    this.book = { ...this.book, state, loaded, total };
    return { ...this.book };
  }

  /**
   * Downloads the whole book (Info page): every content file not on the device yet, a few at a time, with
   * progress in bytes. One run at a time – it goes on when the Info page closes. Asks the browser to keep
   * the storage (no eviction when space runs low).
   */
  downloadBook(): Promise<BookDownload> {
    if (!this.bookRun) this.bookRun = this.runBookDownload().finally(() => { this.bookRun = null; });
    return this.bookRun;
  }

  /** Progress of the whole-book download; returns the unsubscribe function */
  onBookDownload(listener: (download: BookDownload) => void): () => void {
    this.bookListeners.add(listener);
    return () => { this.bookListeners.delete(listener); };
  }

  private async runBookDownload(): Promise<BookDownload> {
    const [files, sizes] = [getBookContent(), await loadContentSizes()];
    const size = (src: string) => sizes[src] ?? 0;
    const total = files.reduce((sum, f) => sum + size(f.src), 0);
    void navigator.storage?.persist?.().catch(() => false);

    const stored = await Promise.all(files.map(f => this.isStored(f.src)));
    const queue = files.filter((_, i) => !stored[i]);
    let loaded = files.reduce((sum, f, i) => sum + (stored[i] ? size(f.src) : 0), 0);
    let failed = 0;
    const report = (state: BookDownload["state"]) => {
      this.book = { state, loaded: Math.min(loaded, total), total, failed };
      this.bookListeners.forEach(listener => listener({ ...this.book }));
    };
    report("running");

    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        let received = 0;
        const result = await this.preload({ ...file, timeout: BOOK_TIMEOUT }, bytes => {
          received += bytes;
          loaded += bytes;
          report("running");
        });
        // Count the file's size from the build (the received bytes differ when the server compressed it)
        loaded += (result.success ? size(file.src) : 0) - received;
        if (!result.success) failed++;
        report("running");
      }
    };
    await Promise.all(Array.from({ length: BOOK_PARALLEL }, worker));
    report(failed ? "failed" : "done");
    return { ...this.book };
  }

  /** On this device: in the service worker's cache (production) or loaded in this session (HTTP cache) */
  private async isStored(src: string): Promise<boolean> {
    if (this.done.has(src)) return true;
    try {
      return typeof caches !== "undefined" && !!(await caches.match(src));
    } catch {
      return false;
    }
  }

  private async fetchIntoCache(src: string, timeout: number, onBytes?: (bytes: number) => void): Promise<LoadResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(src, { signal: controller.signal, priority: "low" } as RequestInit);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      // The body has to be read for the response to be cached
      if (onBytes && response.body) {
        const reader = response.body.getReader();
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) onBytes(chunk.value.byteLength);
      } else {
        await response.arrayBuffer();
      }
      return { success: true };
    } catch (error) {
      console.warn(`[PreloaderService] Failed to preload ${src}:`, error);
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    } finally {
      clearTimeout(timer);
    }
  }
}
