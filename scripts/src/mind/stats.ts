// Numbers of a compile run, for the summary and the benchmark

export interface Timing {
  pixels: number;
  ms: number;
  detectMs: number;
  trackMs: number;
}

export interface Summary<T extends Timing> {
  images: number;
  pixels: number;
  wall: number;
  perImage: number;
  imagesPerMinute: number;
  mpPerSecond: number;
  gpuShare: number; // share of busy time finding features (GPU)
  cpuShare: number; // share of busy time preparing tracking (CPU)
  parallel: number; // busy time / wall time
  slowest: T[];
}

export function summarize<T extends Timing>(results: T[], wall: number): Summary<T> {
  const sum = (key: keyof Timing) => results.reduce((n, r) => n + r[key], 0);
  const busy = sum("ms");
  const pixels = sum("pixels");
  return {
    images: results.length,
    pixels,
    wall,
    perImage: results.length ? wall / results.length : 0,
    imagesPerMinute: wall ? (results.length / wall) * 60_000 : 0,
    mpPerSecond: wall ? pixels / 1e6 / (wall / 1000) : 0,
    gpuShare: busy ? sum("detectMs") / busy : 0,
    cpuShare: busy ? sum("trackMs") / busy : 0,
    parallel: wall ? busy / wall : 0,
    slowest: [...results].sort((a, b) => b.ms - a.ms).slice(0, 3),
  };
}
