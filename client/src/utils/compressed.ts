/**
 * Gzip copies of binary content: the content build writes `<file>.gz` next to every `.mind` (recognition
 * data) and `.glb` (models) – hosts serve these types uncompressed (Netlify: application/octet-stream).
 * Browsers with DecompressionStream (Chrome 80+, Safari 16.4+) load the `.gz` and unpack it; others – or a
 * missing `.gz` – load the original. The preloader and the AR scene use the same URL, so a preload is a
 * cache hit.
 */

/** File types the content build writes a `.gz` copy for (scripts/src/utils/optimize-media.ts) */
const GZIPPED = /\.(mind|glb)$/i;

export const supportsGzip = (): boolean => typeof DecompressionStream === "function";

const isGzipped = (src: string): boolean => GZIPPED.test(src) && !/^[a-z]+:\/\//i.test(src);

/** The URL to download for a content file (its `.gz` copy where there is one and the browser can unpack it) */
export const compressedUrl = (src: string): string => (isGzipped(src) && supportsGzip() ? `${src}.gz` : src);

const fetchBuffer = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
  return response.arrayBuffer();
};

/** Gzip data starts with 1f 8b (a .mind / .glb never does) */
const isGzip = (bytes: Uint8Array): boolean => bytes[0] === 0x1f && bytes[1] === 0x8b;

/**
 * The file's bytes (unpacked from the `.gz` where possible). Some servers send `.gz` files with
 * `Content-Encoding: gzip` (the Vite dev server, often Apache) – the browser has unpacked them already.
 */
export const loadCompressed = async (src: string): Promise<ArrayBuffer> => {
  if (compressedUrl(src) !== src) {
    try {
      const response = await fetch(`${src}.gz`);
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!isGzip(bytes)) return bytes.buffer; // already unpacked by the browser
        const unpacked = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"));
        return await new Response(unpacked).arrayBuffer();
      }
    } catch (error) {
      console.warn(`[compressed] ${src}.gz could not be loaded, using ${src}:`, error);
    }
  }
  return fetchBuffer(src);
};
