/**
 * Recognition data (`.mind`): the content build writes a gzip copy `<name>.mind.gz` next to every `.mind`
 * (hosts serve `.mind` uncompressed – about half the download). Browsers with DecompressionStream
 * (Chrome 80+, Safari 16.4+) load the `.gz` and unpack it; others – or a missing `.gz` – load the `.mind`.
 * The preloader and the AR tracker use the same URL, so a preload is a cache hit.
 */

export const supportsGzip = (): boolean => typeof DecompressionStream === "function";

/** The URL to download for a `.mind` file */
export const mindUrl = (src: string): string => (supportsGzip() ? `${src}.gz` : src);

const fetchBuffer = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
  return response.arrayBuffer();
};

/** The `.mind` file's bytes (unpacked from the `.gz` where possible) */
export const loadMind = async (src: string): Promise<ArrayBuffer> => {
  if (supportsGzip()) {
    try {
      const response = await fetch(`${src}.gz`);
      if (response.ok && response.body) {
        return await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      }
    } catch (error) {
      console.warn(`[mind] ${src}.gz could not be loaded, using ${src}:`, error);
    }
  }
  return fetchBuffer(src);
};
