// npm run mind:benchmark – how fast does this computer compile .mind files, and how many images
// should it compile at a time? Compiles the book's target images with 1, 2, 4 … parallel jobs (no
// cache, nothing written except the result), prints a comparison and remembers the fastest –
// `npm run compile:mind` then uses it.
//
//   npm run mind:benchmark                 all target images, jobs 1, 2, 4 (up to the CPU cores)
//   npm run mind:benchmark --jobs=1,2,4,6  these job counts
//   npm run mind:benchmark --images=6      only the 6 largest images (quicker)
//   --gpu=default  --angle=d3d11  --headed  --browser=<path>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseOptions } from "../lib/cli.js";
import { gpuHint, launchBrowser, openPage } from "./lib/browser.js";
import { bold, cyan, dim, fail, green, log, magenta, mp, pad, row, seconds, step, yellow } from "./lib/console.js";
import { BENCHMARK_FILE } from "./lib/paths.js";
import { compileQueue } from "./lib/run.js";
import { summarize } from "./lib/stats.js";
import { readSpreads, refreshTargets, uniqueImages } from "./lib/targets.js";

const STEPS = 4;
let parsed;
try {
  parsed = parseOptions(process.argv.slice(2), { values: ["browser", "gpu", "angle", "jobs", "images"], flags: ["headed"] });
} catch (error) {
  fail(error.message);
}
const { options } = parsed;
const gpu = options.gpu ?? "high";
const cpus = os.availableParallelism?.() ?? os.cpus().length;

// ── 1. Images ────────────────────────────────────────────────────────────────────────────────────
step(1, STEPS, "Images", "the book's target images, largest first");
const targetsError = refreshTargets();
if (targetsError) fail(`The content build could not read the target images:\n${targetsError}`);
let images = uniqueImages(readSpreads());
if (Number(options.images) > 0) images = images.slice(0, Number(options.images));
if (!images.length) fail("No target images found.");
const pixels = images.reduce((n, i) => n + i.pixels, 0);
row("images", `${bold(images.length)} ${dim(`(${mp(pixels)}, ${images[images.length - 1].width}×${images[images.length - 1].height} to ${images[0].width}×${images[0].height})`)}`);

const jobList = (options.jobs ? String(options.jobs).split(",").map(Number) : [1, 2, 4, 6, 8].filter(n => n <= cpus))
  .filter(n => n > 0 && n <= images.length)
  .filter((n, i, all) => all.indexOf(n) === i);
if (!jobList.length) jobList.push(1);
row("job counts", `${jobList.join(", ")} ${dim(`(${cpus} CPU cores)`)}`);
row("runs", `1 warm-up + ${jobList.length} × ${images.length} images ${dim("– every run compiles all of them from scratch")}`);

// ── 2. Browser and graphics card ─────────────────────────────────────────────────────────────────
step(2, STEPS, "Browser and graphics card");
let browser;
try {
  browser = await launchBrowser({ browserPath: options.browser ?? process.env.MIND_BROWSER, gpu, angle: options.angle, headed: Boolean(options.headed) });
} catch (error) {
  fail(error.message);
}
const probe = await openPage(browser, { gpu });
const gl = await probe.webgl();
await probe.close();
if (!gl) fail("This browser has no WebGL.");
const browserName = `${browser.browserType().name()} ${browser.version()}`;
row("browser", browserName);
row("graphics", cyan(gl.renderer));
const hint = gpuHint(gl.renderer, gpu);
if (hint) log(yellow(`  ⚠ ${hint}`));

// ── 3. Runs ──────────────────────────────────────────────────────────────────────────────────────
step(3, STEPS, "Runs");
// The first compile in a fresh browser also builds its GPU programs – a one-time cost that would make
// whichever run comes first look slow. One untimed pass first, so every run starts warm.
log(`\n  ${bold("Warm-up")} – ${dim("not timed: the browser prepares its GPU programs once")}`);
try {
  await compileQueue(images, { browser, jobs: Math.max(...jobList), gpu, cache: false, quiet: true });
} catch (error) {
  await browser.close();
  fail(error.message);
}
const runs = [];
for (const [i, jobs] of jobList.entries()) {
  log(`\n  ${bold(`Run ${i + 1}/${jobList.length}`)} – ${jobs} image(s) at a time`);
  try {
    const run = await compileQueue(images, { browser, jobs, gpu, cache: false });
    const s = summarize(run.results, run.wall);
    runs.push({ jobs, ...s });
    log(`  ${green("→")} ${bold(seconds(s.wall))} ${dim(`· ${s.imagesPerMinute.toFixed(1)} images/min · ${s.mpPerSecond.toFixed(2)} MP/s`)}`);
  } catch (error) {
    await browser.close();
    fail(error.message);
  }
}
await browser.close();

// ── 4. Result ────────────────────────────────────────────────────────────────────────────────────
step(4, STEPS, "Result");
const fastest = runs.reduce((a, b) => (b.wall < a.wall ? b : a));
const base = runs.find(r => r.jobs === 1) ?? runs[0];
log(`  ${dim(pad("jobs", 6))}${dim(pad("time", 10))}${dim(pad("per image", 11))}${dim(pad("images/min", 12))}${dim(pad("MP/s", 8))}${dim(pad("speed-up", 10))}${dim("GPU / CPU")}`);
for (const r of runs) {
  const mark = r === fastest ? green(" ★ fastest") : "";
  log(
    `  ${pad(bold(r.jobs), 6)}${pad(seconds(r.wall), 10)}${pad(seconds(r.perImage), 11)}${pad(r.imagesPerMinute.toFixed(1), 12)}` +
      `${pad(r.mpPerSecond.toFixed(2), 8)}${pad(`${(base.wall / r.wall).toFixed(2)}×`, 10)}` +
      `${magenta(`${Math.round(r.gpuShare * 100)}%`)} / ${cyan(`${Math.round(r.cpuShare * 100)}%`)}${mark}`,
  );
}
log("");
row("graphics", cyan(gl.renderer));
row("fastest", `${bold(`--jobs=${fastest.jobs}`)} ${dim("– npm run compile:mind now uses it on this graphics card")}`);
row("100 targets", `≈ ${bold(seconds(fastest.perImage * 100))} ${dim("at this image size")}`);
row("slowest image", fastest.slowest.map(r => `${r.name} ${dim(`${r.width}×${r.height}`)} ${seconds(r.ms)}`)[0] ?? "");

fs.mkdirSync(path.dirname(BENCHMARK_FILE), { recursive: true });
fs.writeFileSync(
  BENCHMARK_FILE,
  `${JSON.stringify({ date: new Date().toISOString(), browser: browserName, renderer: gl.renderer, images: images.length, pixels, fastest: fastest.jobs, runs: runs.map(({ slowest, ...r }) => r) }, null, 2)}\n`,
);
