// Compile a list of images with N parallel browser pages, showing live what every job does.
import fs from "node:fs";
import path from "node:path";
import { openPage } from "./browser.js";
import { bar, bold, count, cyan, dim, endLive, green, log, magenta, mp, pad, red, seconds, setLive, tty } from "./console.js";

const label = image => `${image.spread}[${image.index}] ${image.name}`;

/** One finished image, e.g. "✔ spread3[0] images-060.jpg  2059×1796 3.7 MP  find 9.8s + track 0.4s = 10.2s  14 sizes · 4.8k features" */
export function imageLine(r) {
  return (
    `  ${green("✔")} ${pad(bold(label(r)), 34)} ${pad(dim(`${r.width}×${r.height} ${mp(r.pixels)}`), 18)}` +
    `  ${magenta(`find ${seconds(r.detectMs)}`)} + ${cyan(`track ${seconds(r.trackMs)}`)} = ${bold(seconds(r.ms))}` +
    `  ${dim(`${r.keyframes} sizes · ${count(r.points)} features`)}`
  );
}

/**
 * Compile `queue` (images from targets.js). { browser, jobs, gpu, cache: write results to image.cache }
 * → { results[{ ...image, mind, ms, detectMs, trackMs, keyframes, points }], wall }
 */
export async function compileQueue(queue, { browser, jobs: jobCount, gpu, cache = true }) {
  const images = new Map(queue.map(image => [path.basename(image.cache), image.file]));
  const totalPixels = queue.reduce((n, image) => n + image.pixels, 0);
  const results = [];
  const started = Date.now();
  let donePixels = 0;

  const jobs = await Promise.all(
    Array.from({ length: Math.max(1, Math.min(jobCount, queue.length)) }, async (_, i) => {
      const job = { n: i + 1, image: null, percent: 0, since: 0 };
      job.page = await openPage(browser, {
        gpu,
        images,
        onProgress: percent => (job.percent = percent),
        onError: message => log(red(`  page error (job ${job.n}): ${message}`)),
      });
      return job;
    }),
  );

  const render = () => {
    const running = jobs.reduce((n, job) => n + (job.image ? (job.image.pixels * job.percent) / 100 : 0), 0);
    const fraction = totalPixels ? (donePixels + running) / totalPixels : 1;
    const elapsed = Date.now() - started;
    const left = fraction > 0.03 ? `~${seconds(elapsed / fraction - elapsed)} left` : "estimating…";
    const lines = jobs.map(job => {
      if (!job.image) return `  ${dim(`job ${job.n}`)}  ${dim("waiting")}`;
      const phase = job.percent < 50 ? magenta("finding features (GPU)") : cyan("preparing tracking (CPU)");
      return `  ${dim(`job ${job.n}`)}  ${pad(label(job.image), 34)} ${bar(job.percent / 100, 12)} ${String(Math.floor(job.percent)).padStart(3)}%  ${pad(phase, 26)} ${dim(seconds(Date.now() - job.since))}`;
    });
    lines.push(
      `  ${bold("all  ")}  ${pad(`${results.length} of ${queue.length} images done`, 34)} ${bar(fraction, 12)} ${String(Math.floor(fraction * 100)).padStart(3)}%  ` +
        `${pad(`${((donePixels + running) / 1e6 / Math.max(0.001, elapsed / 1000)).toFixed(2)} MP/s`, 26)} ${dim(`${seconds(elapsed)} · ${left}`)}`,
    );
    setLive(lines);
  };
  const ticker = tty ? setInterval(render, 200) : null;

  const next = [...queue];
  try {
    await Promise.all(
      jobs.map(async job => {
        for (let image; (image = next.shift()); ) {
          Object.assign(job, { image, percent: 0, since: Date.now() });
          const result = await job.page.compile(path.basename(image.cache));
          const r = { ...image, ...result, ms: Date.now() - job.since, job: job.n };
          if (cache) {
            fs.mkdirSync(path.dirname(image.cache), { recursive: true });
            fs.writeFileSync(image.cache, Buffer.from(result.mind, "base64"));
          }
          donePixels += image.pixels;
          job.image = null;
          results.push(r);
          log(imageLine(r));
        }
      }),
    );
  } finally {
    if (ticker) clearInterval(ticker);
    endLive();
    await Promise.all(jobs.map(job => job.page.close()));
  }
  return { results, wall: Date.now() - started };
}
