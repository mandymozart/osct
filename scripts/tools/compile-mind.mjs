// Compile the spreads' recognition data (`.mind`) locally, in a real browser with WebGL – MindAR's own
// `Compiler` (HiuKim, https://github.com/hiukim/mind-ar-js, MIT; vendored unchanged in
// client/src/vendor/mind-ar/ – no compiler code of our own here), the same compiler as https://hiukim.github.io/mind-ar-js-doc/tools/compile and the same MindAR version
// the app runs (client/src/vendor/mind-ar/). Run by hand after changing target images; CI and deploys
// never compile, the content build only checks that each .mind is up to date (docs/content.md).
//
//   cd scripts
//   npm run compile:mind                        # spreads whose target images changed
//   npm run compile:mind -- spread1 spread3     # these spreads (always rebuilt)
//   npm run compile:mind -- --force             # all spreads, no cache
//   npm run compile:mind -- --fresh             # compile every image again (benchmarks; also --no-cache)
//   npm run compile:mind -- --jobs 6            # parallel browser jobs (default: half the CPU cores, max 4)
//   npm run compile:mind -- --gpu default       # let Chrome pick the GPU (default: high-performance)
//   npm run compile:mind -- --angle d3d11       # WebGL backend: d3d11 | vulkan | gl | metal …
//   npm run compile:mind -- --headed            # visible browser window (if headless has no GPU)
//   npm run compile:mind -- --browser <path>    # this Chrome/Chromium/Edge (or env MIND_BROWSER)
//   npm run compile:mind -- --note "sharper scan"  # note stored with the version (mind:history)
//
// PowerShell drops the `--` – there write values with "=": npm run compile:mind --gpu=default --jobs=6
// (tools/lib/cli.mjs), or call npm.cmd.
//
// Every compiled .mind is kept as a version in mind-history/ (the one it replaces too): test it on the
// phone, `npm run mind:restore -- <spread> previous` goes back (tools/mind-history.mjs).
//
// Browser: your installed Chrome, else Edge, else Playwright's Chromium (`npx playwright install
// chromium`). The WebGL renderer is printed – "SwiftShader" / "llvmpipe" means software WebGL (slow).
//
// How: `node dist/index.js --targets` puts each spread's target images in MindAR order into
// mind-ar/<spread>/ with source.sha256. Every image is compiled on its own (MindAR compiles images
// independently – same bytes as compiling them together): feature detection on the GPU (TF.js WebGL),
// then tracking features on the CPU (MindAR's worker). Results are cached per image in
// scripts/.cache/mind/, so a changed spread only compiles its new images. The images of a spread are
// then merged into content/spreads/<spread>/<mind> (+ <mind>.sha256) and the content build runs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { chromium } from "playwright-core";
import { parseOptions } from "./lib/cli.mjs";
import { saveVersion } from "./lib/mind-history.mjs";

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(SCRIPTS, "..");
const MINDAR_DIR = path.join(ROOT, "mind-ar");
const SPREADS_DIR = path.join(ROOT, "content/spreads");
const VENDOR_DIR = path.join(ROOT, "client/src/vendor/mind-ar");
const CACHE_DIR = path.join(SCRIPTS, ".cache/mind");
const HISTORY_DIR = path.join(ROOT, "mind-history");
const IMAGE = /\.(jpe?g|png|webp)$/i;
const ORIGIN = "http://mind.local";

// ── Options ──────────────────────────────────────────────────────────────────────────────────────

let parsed;
try {
  parsed = parseOptions(process.argv.slice(2), {
    values: ["browser", "gpu", "angle", "jobs", "note"],
    flags: ["force", "no-cache", "fresh", "headed"],
  });
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exit(1);
}
const { options, rest: requested } = parsed;
const browserPath = options.browser ?? process.env.MIND_BROWSER;
const gpu = options.gpu ?? "high";
const angle = options.angle;
const jobsOption = options.jobs;
const force = Boolean(options.force);
const noCache = Boolean(options["no-cache"] || options.fresh) || force;
const headed = Boolean(options.headed);
const note = options.note;
const cpus = os.availableParallelism?.() ?? os.cpus().length;
const jobCount = Math.max(1, Number(jobsOption) || Math.min(4, Math.floor(cpus / 2)));

// ── Console ──────────────────────────────────────────────────────────────────────────────────────

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = code => text => (tty ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const [bold, dim, green, yellow, red, cyan, magenta] = [1, 2, 32, 33, 31, 36, 35].map(paint);
const seconds = ms => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`);
const kb = bytes => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const count = n => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const mp = pixels => `${(pixels / 1e6).toFixed(1)} MP`;

let statusLine = "";
const clearStatus = () => tty && statusLine && process.stdout.write("\r\x1b[2K");
const log = (...parts) => {
  clearStatus();
  console.log(...parts);
  if (tty && statusLine) process.stdout.write(statusLine);
};
const status = text => {
  if (!tty) return;
  statusLine = text;
  process.stdout.write(`\r\x1b[2K${text}`);
};
const heading = text => log(`\n${bold(text)} ${dim("─".repeat(Math.max(0, 60 - text.length)))}`);

// ── 1. Target images per spread, in MindAR order ─────────────────────────────────────────────────

const contentBuild = (...flags) => spawnSync(process.execPath, ["dist/index.js", ...flags], { cwd: SCRIPTS, stdio: flags.length ? "pipe" : "inherit" });
const targets = contentBuild("--targets");
if (targets.status !== 0) {
  process.stdout.write(targets.stdout);
  process.stderr.write(targets.stderr);
  process.exit(1);
}

/** JPEG / PNG size from the file header (the cache key doesn't need the browser) */
function imageSize(buffer) {
  if (buffer.readUInt32BE(0) === 0x89504e47) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  for (let i = 2; i < buffer.length; ) {
    const marker = buffer[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return { width: 0, height: 0 };
}

// Cache key: image bytes + the vendored compiler (a MindAR upgrade invalidates the cache)
const compilerHash = createHash("sha256");
for (const file of fs.readdirSync(VENDOR_DIR).filter(f => f.endsWith(".js")).sort()) compilerHash.update(fs.readFileSync(path.join(VENDOR_DIR, file)));
const compilerId = compilerHash.digest("hex").slice(0, 12);

const spreads = fs
  .readdirSync(MINDAR_DIR)
  .filter(id => !requested.length || requested.includes(id))
  .map(id => {
    const dir = path.join(MINDAR_DIR, id);
    const { mind } = yaml.load(fs.readFileSync(path.join(SPREADS_DIR, id, "spread.yaml"), "utf8"));
    const out = path.join(SPREADS_DIR, id, mind);
    const hash = fs.readFileSync(path.join(dir, "source.sha256"), "utf8").trim();
    const compiledFrom = fs.existsSync(`${out}.sha256`) ? fs.readFileSync(`${out}.sha256`, "utf8").trim() : null;
    const images = fs
      .readdirSync(dir)
      .filter(f => IMAGE.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(name => {
        const file = path.join(dir, name);
        const bytes = fs.readFileSync(file);
        const key = createHash("sha256").update(bytes).digest("hex");
        return { spread: id, name: name.replace(/^\d+-/, ""), index: parseInt(name), file, ...imageSize(bytes), cache: path.join(CACHE_DIR, `${key}-${compilerId}.mind`) };
      });
    return { id, out, hash, images, stale: hash !== compiledFrom };
  });

const unknown = requested.filter(id => !spreads.some(s => s.id === id));
if (unknown.length) {
  console.error(red(`✖ Unknown spread(s): ${unknown.join(", ")}`));
  process.exit(1);
}
const todo = spreads.filter(s => force || requested.length || s.stale);
if (!todo.length) {
  console.log(green(`✔ All ${spreads.length} .mind files are up to date.`) + dim(" `--force` recompiles all."));
  process.exit(0);
}
const empty = todo.filter(s => !s.images.length);
if (empty.length) {
  console.error(red(`✖ No target images: ${empty.map(s => s.id).join(", ")}`));
  process.exit(1);
}

// Identical images (also across spreads) compile once; the browser gets them as /image/<cache name>
const unique = new Map();
for (const image of todo.flatMap(s => s.images)) if (!unique.has(image.cache)) unique.set(image.cache, image);
const queue = [...unique.values()].filter(image => noCache || !fs.existsSync(image.cache));
queue.sort((a, b) => b.width * b.height - a.width * a.height); // largest first: better job balance, honest ETA
const cachedCount = unique.size - queue.length;
const imageFiles = new Map(queue.map(image => [path.basename(image.cache), image.file]));

heading("Compile .mind");
log(`  ${bold(todo.length)} spread(s) ${dim(todo.map(s => s.id).join(", "))}`);
log(`  ${bold(unique.size)} image(s): ${bold(queue.length)} to compile, ${cachedCount} cached ${dim(`(${path.relative(ROOT, CACHE_DIR)})`)}`);

// ── 2. Browser ───────────────────────────────────────────────────────────────────────────────────

const browserArgs = [
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  ...(gpu === "high" ? ["--force_high_performance_gpu"] : []),
  ...(angle ? [`--use-angle=${angle}`] : []),
];

async function launch() {
  const options = { headless: !headed, args: browserArgs };
  if (browserPath) return chromium.launch({ ...options, executablePath: browserPath });
  const failures = [];
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await chromium.launch({ ...options, channel });
    } catch (error) {
      failures.push(`${channel ?? "playwright chromium"}: ${error.message.split("\n")[0]}`);
    }
  }
  throw new Error(`No browser found – install Chrome or pass --browser <path>.\n  ${failures.join("\n  ")}`);
}

// TF.js (inside MindAR) creates its WebGL context without a power preference: on laptops with two GPUs
// the browser may pick the integrated one. Ask for the fast one.
const powerPreferenceScript = gpu === "high"
  ? `for (const C of [HTMLCanvasElement, typeof OffscreenCanvas === "undefined" ? null : OffscreenCanvas]) {
       if (!C) continue;
       const getContext = C.prototype.getContext;
       C.prototype.getContext = function (type, attributes) {
         return getContext.call(this, type, /webgl/.test(type) ? { ...attributes, powerPreference: "high-performance" } : attributes);
       };
     }`
  : "";

/** One browser job: own context (own renderer process, own MindAR worker), compiles one image at a time */
async function openJob(browser, onProgress) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (!name) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>compile-mind</title>" });
    if (name.startsWith("vendor/")) return route.fulfill({ path: path.join(VENDOR_DIR, path.basename(name)), contentType: "text/javascript" });
    if (name.startsWith("image/") && imageFiles.has(name.slice(6))) return route.fulfill({ path: imageFiles.get(name.slice(6)) });
    return route.fulfill({ status: 404 });
  });
  page.on("pageerror", error => log(red(`  page error: ${error.message}`)));
  if (powerPreferenceScript) await page.addInitScript(powerPreferenceScript);
  await page.exposeFunction("progress", onProgress);
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(async () => {
    const { Compiler } = await import("/vendor/mindar-image.prod.js");
    const toBase64 = bytes => {
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

    window.webgl = () => {
      const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
      if (!gl) return null;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      };
    };

    // Matching features (0–50 %, GPU) then tracking features (50–100 %, CPU worker)
    window.compileImage = async url => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const compiler = new Compiler();
      const start = performance.now();
      let detected = start;
      await compiler.compileImageTargets([img], percent => {
        if (percent <= 50.0001) detected = performance.now();
        window.progress(percent);
      });
      const end = performance.now();
      const [data] = compiler.data;
      return {
        mind: toBase64(compiler.exportData()),
        keyframes: data.matchingData.length,
        points: data.matchingData.reduce((n, k) => n + k.maximaPoints.length + k.minimaPoints.length, 0),
        trackingPoints: data.trackingData.reduce((n, t) => n + t.points.length, 0),
        detectMs: detected - start,
        trackMs: end - detected,
      };
    };

    // One .mind from single-image .mind files, in order (what exportData writes for all images together)
    window.mergeMinds = files => {
      const compiler = new Compiler();
      compiler.data = files.flatMap(file => new Compiler().importData(fromBase64(file)));
      return toBase64(compiler.exportData());
    };
  });
  return { context, page };
}

// ── 3. Compile ───────────────────────────────────────────────────────────────────────────────────

const totalPixels = queue.reduce((n, image) => n + image.width * image.height, 0);
const results = [];
const started = Date.now();
let browser;
let gl;
try {
  browser = await launch();
  const jobs = await Promise.all(
    Array.from({ length: Math.max(1, Math.min(jobCount, queue.length)) }, (_, i) => {
      const job = { id: i, image: null, percent: 0 };
      return openJob(browser, percent => {
        job.percent = percent;
      }).then(opened => Object.assign(job, opened));
    }),
  );

  gl = await jobs[0].page.evaluate(() => window.webgl());
  heading("GPU");
  log(`  ${bold(browser.browserType().name())} ${browser.version()} ${dim(`· ${headed ? "headed" : "headless"} · gpu ${gpu}${angle ? ` · angle ${angle}` : ""}`)}`);
  if (!gl) throw new Error("The browser has no WebGL.");
  log(`  ${cyan(gl.renderer)} ${dim(gl.vendor)}`);
  if (/swiftshader|llvmpipe|software|microsoft basic/i.test(gl.renderer)) {
    log(yellow("  ⚠ Software WebGL – works, but slow. Try --headed, --angle d3d11 / vulkan, or another --browser."));
  } else if (gpu === "high" && /intel|uhd|iris|radeon\(tm\) graphics/i.test(gl.renderer) && !/nvidia|geforce|rtx|gtx/i.test(gl.renderer)) {
    log(yellow("  ⚠ Looks like an integrated GPU. Windows: Settings → System → Display → Graphics → add Chrome →"));
    log(yellow("    High performance; NVIDIA Control Panel → Manage 3D settings → Chrome → High-performance NVIDIA processor."));
  }

  if (queue.length) {
    heading(`Images (${queue.length} · ${mp(totalPixels)} · ${jobs.length} job${jobs.length > 1 ? "s" : ""})`);
    let donePixels = 0;
    const render = () => {
      const running = jobs.reduce((n, job) => n + (job.image ? (job.image.width * job.image.height * job.percent) / 100 : 0), 0);
      const fraction = totalPixels ? Math.min(1, (donePixels + running) / totalPixels) : 1;
      const elapsed = Date.now() - started;
      const width = 28;
      const bar = green("█".repeat(Math.round(fraction * width))) + dim("░".repeat(width - Math.round(fraction * width)));
      const eta = fraction > 0.02 ? seconds(elapsed / fraction - elapsed) : "…";
      const rate = elapsed > 0 ? (donePixels + running) / 1e6 / (elapsed / 1000) : 0;
      status(`  ${bar} ${bold(`${Math.floor(fraction * 100)}%`.padStart(4))} ${results.length}/${queue.length} · ${rate.toFixed(2)} MP/s · ${seconds(elapsed)} · ETA ${eta}`);
    };
    const ticker = setInterval(render, 150);
    const next = [...queue];
    await Promise.all(
      jobs.map(async job => {
        for (let image; (image = next.shift()); ) {
          Object.assign(job, { image, percent: 0 });
          const imageStart = Date.now();
          const result = await job.page.evaluate(url => window.compileImage(url), `/image/${path.basename(image.cache)}`);
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(image.cache, Buffer.from(result.mind, "base64"));
          donePixels += image.width * image.height;
          job.image = null;
          const entry = { ...image, ...result, ms: Date.now() - imageStart, job: job.id };
          results.push(entry);
          log(
            `  ${green("✔")} ${bold(`${image.spread}[${image.index}]`)} ${image.name} ${dim(`${image.width}×${image.height}`)}` +
              `  ${dim(`${entry.keyframes} kf · ${count(entry.points)} pts · ${count(entry.trackingPoints)} track`)}` +
              `  ${magenta(`gpu ${seconds(entry.detectMs)}`)} ${cyan(`cpu ${seconds(entry.trackMs)}`)} ${bold(seconds(entry.ms))}`,
          );
          render();
        }
      }),
    );
    clearInterval(ticker);
    clearStatus();
    statusLine = "";
  }

  // ── 4. Merge per spread ──────────────────────────────────────────────────────────────────────────
  heading("Spreads");
  for (const spread of todo) {
    const files = spread.images.map(image => fs.readFileSync(image.cache).toString("base64"));
    const merged = Buffer.from(await jobs[0].page.evaluate(list => window.mergeMinds(list), files), "base64");
    // The file being replaced stays restorable (dated by its last change)
    if (fs.existsSync(spread.out)) {
      saveVersion(HISTORY_DIR, spread.id, spread.out, { date: fs.statSync(spread.out).mtime, note: "before compile" });
    }
    fs.writeFileSync(spread.out, merged);
    fs.writeFileSync(`${spread.out}.sha256`, `${spread.hash}\n`);
    const compiled = spread.images.filter(image => results.some(r => r.cache === image.cache)).length;
    spread.bytes = merged.length;
    const version = saveVersion(HISTORY_DIR, spread.id, spread.out, {
      note,
      browser: `${browser.browserType().name()} ${browser.version()}`,
      renderer: gl?.renderer,
      sourceHash: spread.hash,
      images: spread.images.map(image => {
        const result = results.find(r => r.cache === image.cache);
        const { width, height } = image;
        return result
          ? { index: image.index, name: image.name, width, height, keyframes: result.keyframes, points: result.points, ms: result.ms }
          : { index: image.index, name: image.name, width, height, cached: true };
      }),
    });
    log(
      `  ${green("✔")} ${bold(path.relative(ROOT, spread.out))}  ${spread.images.length} target(s) · ${kb(merged.length)}` +
        `  ${dim(`${compiled} compiled, ${spread.images.length - compiled} cached · version ${version.id}`)}`,
    );
  }
  await Promise.all(jobs.map(job => job.context.close()));
} catch (error) {
  clearStatus();
  console.error(red(`\n✖ ${error.message}`));
  process.exit(1);
} finally {
  await browser?.close();
}

// ── 5. Statistics ────────────────────────────────────────────────────────────────────────────────

const wall = Date.now() - started;
heading("Statistics");
const row = (label, value) => log(`  ${dim(label.padEnd(12))} ${value}`);
row("spreads", `${todo.length} written · ${kb(todo.reduce((n, s) => n + s.bytes, 0))} .mind`);
row("images", `${results.length} compiled · ${cachedCount} from cache`);
if (results.length) {
  const sum = key => results.reduce((n, r) => n + r[key], 0);
  const busy = sum("ms");
  row("pixels", `${mp(totalPixels)} · ${(totalPixels / 1e6 / (wall / 1000)).toFixed(2)} MP/s`);
  row("time", `${bold(seconds(wall))} wall · ${seconds(busy / results.length)} per image · ${((results.length / wall) * 60_000).toFixed(1)} images/min`);
  row("split", `${magenta(`gpu detect ${Math.round((sum("detectMs") / busy) * 100)}%`)} · ${cyan(`cpu track ${Math.round((sum("trackMs") / busy) * 100)}%`)} ${dim(`(of ${seconds(busy)} busy over ${jobCount > 1 ? `${Math.min(jobCount, results.length)} jobs` : "1 job"})`)}`);
  row("parallel", `${(busy / wall).toFixed(2)}× from ${Math.min(jobCount, results.length)} job(s) ${dim(`· ${cpus} CPU cores – compare --jobs values on a large run`)}`);
  const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3);
  row("slowest", slowest.map(r => `${r.spread}/${r.name} ${dim(`${r.width}×${r.height}`)} ${seconds(r.ms)}`).join(dim(" · ")));
  row("estimate", `${dim("100 targets ≈")} ${seconds((wall / results.length) * 100)} ${dim("at this rate and image size")}`);
}

// ── 6. Content build with the new .mind files ────────────────────────────────────────────────────
heading("Content build");
process.exit(contentBuild().status ?? 1);
