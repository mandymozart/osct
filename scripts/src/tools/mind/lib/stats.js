// Numbers of a compile run, for the summary and the benchmark
export function summarize(results, wall) {
  const sum = key => results.reduce((n, r) => n + r[key], 0);
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
