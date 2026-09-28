// Compile a list of images with N parallel browser pages, showing live what every job does.
import fs from "node:fs";
import path from "node:path";
import { bar, bold, count, cyan, dim, endLive, green, log, magenta, mp, pad, red, seconds, setLive, tty } from "../lib/console";
import { openPage, type Browser, type CompilePage, type GpuChoice, type PageResult } from "./browser";
import type { TargetImage } from "./targets";

export interface CompiledImage extends TargetImage, PageResult {
  ms: number; // whole image, as seen by the job
  job: number;
}

export interface RunOptions {
  browser: Browser;
  jobs: number;
  gpu: GpuChoice;
  cache?: boolean; // write each result to image.cache
  quiet?: boolean; // no line per image
}

interface Job {
  n: number;
  page?: CompilePage;
  image: TargetImage | null;
  percent: number;
  since: number;
}

const label = (image: TargetImage) => `${image.spread}[${image.index}] ${image.name}`;

/** One finished image: size, time finding features (GPU) + preparing tracking (CPU), what was found */
export function imageLine(r: CompiledImage): string {
  return (
    `  ${green("✔")} ${pad(bold(label(r)), 34)} ${pad(dim(`${r.width}×${r.height} ${mp(r.pixels)}`), 18)}` +
    `  ${magenta(`find ${seconds(r.detectMs)}`)} + ${cyan(`track ${seconds(r.trackMs)}`)} = ${bold(seconds(r.ms))}` +
    `  ${dim(`${r.keyframes} sizes · ${count(r.points)} features`)}`
  );
}

export async function compileQueue(queue: TargetImage[], { browser, jobs: jobCount, gpu, cache = true, quiet = false }: RunOptions): Promise<{ results: CompiledImage[]; wall: number }> {
  const images = new Map(queue.map(image => [path.basename(image.cache), image.file]));
  const totalPixels = queue.reduce((n, image) => n + image.pixels, 0);
  const results: CompiledImage[] = [];
  const started = Date.now();
  let donePixels = 0;

  const jobs = await Promise.all(
    Array.from({ length: Math.max(1, Math.min(jobCount, queue.length)) }, async (_, i) => {
      const job: Job = { n: i + 1, image: null, percent: 0, since: 0 };
      job.page = await openPage(browser, {
        site: job.n,
        gpu,
        images,
        onProgress: percent => (job.percent = percent),
        onError: message => log(red(`  page error (job ${job.n}): ${message}`)),
      });
      return job as Required<Job>;
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
        for (let image = next.shift(); image; image = next.shift()) {
          Object.assign(job, { image, percent: 0, since: Date.now() });
          const result = await job.page.compile(path.basename(image.cache));
          const r: CompiledImage = { ...image, ...result, ms: Date.now() - job.since, job: job.n };
          if (cache) {
            fs.mkdirSync(path.dirname(image.cache), { recursive: true });
            fs.writeFileSync(image.cache, Buffer.from(result.mind, "base64"));
          }
          donePixels += image.pixels;
          job.image = null;
          results.push(r);
          if (!quiet) log(imageLine(r));
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
