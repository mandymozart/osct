// npm run compile:mind – compile the spreads' recognition data (.mind) on this computer, in Chrome/Edge
// with the graphics card. It runs MindAR's own compiler (HiuKim, https://github.com/hiukim/mind-ar-js,
// MIT; vendored unchanged in client/src/vendor/mind-ar/ – no compiler code of our own).
//
//   npm run compile:mind                  spreads whose target images changed
//   npm run compile:mind spread1          only these spreads
//   npm run compile:mind --force          all spreads
//   npm run compile:mind --fresh          all spreads, every image compiled again (no cache)
//   --jobs=4  --note="…"  --gpu=default  --angle=d3d11  --headed  --browser=<path>
//
// Steps: target images (from the content build) → browser + GPU → compile each image (cached in
//   .mindar/cache/) → merge per spread into content/spreads/<spread>/<name>.mind (+ .sha256,
// + a version in .mindar/history/) → summary → content build.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MIND_BENCHMARK_FILE, MIND_CACHE_DIR, MIND_HISTORY_DIR, projectRoot } from "../config";
import { parseOptions, text } from "../lib/cli";
import { bold, count, cyan, dim, fail, green, kb, log, magenta, mp, pad, row, seconds, step, yellow } from "../lib/console";
import { gpuHint, launchBrowser, openPage, type Browser, type GpuChoice } from "./browser";
import { compileQueue, type CompiledImage } from "./run";
import { summarize } from "./stats";
import { contentBuild, readSpreads, refreshTargets, uniqueImages, type SpreadState } from "./targets";
import { saveVersion } from "./versions";

const STEPS = 6;
let parsed: ReturnType<typeof parseOptions> | undefined;
try {
  parsed = parseOptions(process.argv.slice(2), {
    values: ["browser", "gpu", "angle", "jobs", "note"],
    flags: ["force", "no-cache", "fresh", "headed"],
  });
} catch (error) {
  fail((error as Error).message);
}
const { options, rest: requested } = parsed!;
const fresh = Boolean(options.fresh || options["no-cache"]);
const everything = Boolean(options.force || ((options.fresh || options["no-cache"]) && !requested.length));
const gpu: GpuChoice = options.gpu === "default" ? "default" : "high";
const browserOptions = { browserPath: text(options, "browser") ?? process.env.MIND_BROWSER, gpu, angle: text(options, "angle"), headed: Boolean(options.headed) };

// ── 1. Target images ─────────────────────────────────────────────────────────────────────────────
step(1, STEPS, "Target images", "which spreads need a new .mind?");
const targetsError = refreshTargets();
if (targetsError) fail(`The content build could not read the target images:\n${targetsError}`);

const spreads = readSpreads(requested);
const unknown = requested.filter(id => !spreads.some(s => s.id === id));
if (unknown.length) fail(`Unknown spread(s): ${unknown.join(", ")}. Known: ${readSpreads().map(s => s.id).join(", ")}`);

const STATE: Record<SpreadState, string> = {
  ok: dim("up to date"),
  changed: yellow("target images changed"),
  new: yellow("no .mind yet"),
  unknown: yellow("no fingerprint – can't tell"),
};
const todo = spreads.filter(s => everything || requested.length || s.state !== "ok");
for (const s of spreads) {
  const will = todo.includes(s) ? bold("→ compile") : dim("  skip");
  const why = s.state === "ok" && todo.includes(s) ? dim(everything ? "(forced)" : "(asked for)") : STATE[s.state];
  row(s.id, `${pad(`${s.images.length} target(s)`, 14)} ${pad(will, 12)} ${why}`);
}
if (!todo.length) {
  log(`\n${green("✔ Nothing to compile – every .mind matches its target images.")}`);
  log(`  ${dim("Compile anyway:")}     npm run compile:mind --force`);
  log(`  ${dim("All from scratch:")}   npm run compile:mind --fresh`);
  log(`  ${dim("Measure the speed:")}  npm run mind:benchmark`);
  process.exit(0);
}
const empty = todo.filter(s => !s.images.length);
if (empty.length) fail(`No target images on: ${empty.map(s => s.id).join(", ")}`);

const images = uniqueImages(todo);
const queue = images.filter(image => fresh || !fs.existsSync(image.cache));
const cached = images.length - queue.length;
log("");
row("to compile", `${bold(queue.length)} image(s), ${mp(queue.reduce((n, i) => n + i.pixels, 0))}`);
if (cached) row("from cache", `${cached} image(s) ${dim("– compiled before and unchanged (--fresh compiles them again)")}`);

// ── 2. Browser and graphics card ─────────────────────────────────────────────────────────────────
step(2, STEPS, "Browser and graphics card");
let launched: Browser | undefined;
try {
  launched = await launchBrowser(browserOptions);
} catch (error) {
  fail((error as Error).message);
}
const browser = launched!;
const probe = await openPage(browser, { gpu });
const gl = await probe.webgl();
await probe.close();
if (!gl) fail("This browser has no WebGL.");
const renderer = gl!.renderer;
row("browser", `${browser.name} ${dim(`(${browserOptions.headed ? "window" : "headless"})`)}`);
row("graphics", cyan(renderer));
row("GPU choice", gpu === "high" ? "fast GPU requested" : dim("left to the browser (--gpu=default)"));
const hint = gpuHint(renderer, gpu);
if (hint) log(yellow(`  ⚠ ${hint}`));

// Parallel jobs: --jobs, else the benchmark's fastest on this graphics card, else half the cores (max 4)
let benchmark: { renderer: string; fastest: number; date: string } | null = null;
try {
  benchmark = JSON.parse(fs.readFileSync(MIND_BENCHMARK_FILE, "utf8"));
} catch {
  // no benchmark yet
}
const cpus = os.availableParallelism?.() ?? os.cpus().length;
let jobs = Math.max(1, Math.min(4, Math.floor(cpus / 2)));
let jobsWhy = `default: half of ${cpus} CPU cores, max 4 – \`npm run mind:benchmark\` finds the fastest`;
if (Number(options.jobs) > 0) [jobs, jobsWhy] = [Number(options.jobs), "--jobs"];
else if (benchmark?.renderer === renderer && benchmark.fastest) {
  [jobs, jobsWhy] = [benchmark.fastest, `fastest in your benchmark of ${benchmark.date.slice(0, 10)}`];
}
row("jobs", `${bold(jobs)} image(s) at a time ${dim(`(${jobsWhy})`)}`);

// ── 3. Compile ───────────────────────────────────────────────────────────────────────────────────
step(3, STEPS, "Compile images", queue.length ? `${queue.length} image(s), largest first` : "");
let run: { results: CompiledImage[]; wall: number } = { results: [], wall: 0 };
if (!queue.length) {
  log(dim("  All images come from the cache – nothing to compile."));
} else {
  log(dim(`  Per image: the GPU ${magenta("finds")} the features at several sizes, then the CPU prepares ${cyan("tracking")}.`));
  log("");
  try {
    run = await compileQueue(queue, { browser, jobs, gpu, cache: true });
  } catch (error) {
    await browser.close();
    fail((error as Error).message);
  }
}

// ── 4. Write the .mind files ─────────────────────────────────────────────────────────────────────
step(4, STEPS, "Write .mind files", "one per spread, earlier versions kept in .mindar/history/");
const merger = await openPage(browser, { gpu });
let written = 0;
for (const spread of todo) {
  const merged = Buffer.from(await merger.merge(spread.images.map(image => fs.readFileSync(image.cache).toString("base64"))), "base64");
  // The file being replaced stays restorable
  if (fs.existsSync(spread.out)) saveVersion(MIND_HISTORY_DIR, spread.id, spread.out, { date: fs.statSync(spread.out).mtime, note: "before compile" });
  fs.writeFileSync(spread.out, merged);
  fs.writeFileSync(`${spread.out}.sha256`, `${spread.hash}\n`);
  written += merged.length;
  const compiledHere = spread.images.filter(image => run.results.some(r => r.cache === image.cache));
  const version = saveVersion(MIND_HISTORY_DIR, spread.id, spread.out, {
    note: text(options, "note"),
    browser: browser.name,
    renderer,
    sourceHash: spread.hash,
    images: spread.images.map(image => {
      const r = run.results.find(x => x.cache === image.cache);
      const base = { index: image.index, name: image.name, width: image.width, height: image.height };
      return r ? { ...base, keyframes: r.keyframes, points: r.points, ms: r.ms } : { ...base, cached: true };
    }),
  });
  log(`  ${green("✔")} ${pad(bold(path.relative(projectRoot, spread.out)), 42)} ${pad(kb(merged.length), 8)} ${dim(`${spread.images.length} target(s) · ${compiledHere.length} compiled · version ${version.id}`)}`);
}
await merger.close();
await browser.close();

// ── 5. Summary ───────────────────────────────────────────────────────────────────────────────────
step(5, STEPS, "Summary");
row("spreads", `${todo.length} written, ${kb(written)}`);
row("images", `${run.results.length} compiled, ${cached} from cache`);
if (run.results.length) {
  const s = summarize(run.results, run.wall);
  row("time", `${bold(seconds(s.wall))} ${dim(`(${jobs} job(s) in parallel)`)}`);
  row("per image", `${seconds(s.perImage)} on average ${dim(`· ${s.imagesPerMinute.toFixed(1)} images/min · ${s.mpPerSecond.toFixed(2)} MP/s`)}`);
  row("time spent", `${magenta(`${Math.round(s.gpuShare * 100)}% finding features (GPU)`)} · ${cyan(`${Math.round(s.cpuShare * 100)}% preparing tracking (CPU)`)}`);
  row("slowest", s.slowest.map(r => `${r.name} ${dim(`${r.width}×${r.height}`)} ${seconds(r.ms)}`).join(dim(" · ")));
  row("100 targets", `≈ ${bold(seconds(s.perImage * 100))} ${dim("at this speed and image size")}`);
  row("", dim(`${count(run.results.reduce((n, r) => n + r.points, 0))} features found · cache: ${path.relative(projectRoot, MIND_CACHE_DIR)}`));
}

// ── 6. Content build ─────────────────────────────────────────────────────────────────────────────
step(6, STEPS, "Content build", "checks the content and copies the new .mind files into the app");
process.exit(contentBuild().status ?? 1);
