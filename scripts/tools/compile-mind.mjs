// Compile the spreads' recognition data (`.mind`) locally, in a real browser with WebGL – the same
// MindAR compiler as https://hiukim.github.io/mind-ar-js-doc/tools/compile and the same MindAR version
// the app runs (client/src/vendor/mind-ar/). Run by hand after changing target images; CI and deploys
// never compile, the content build only checks that each .mind is up to date (docs/content.md).
//
//   cd scripts
//   npm run compile:mind                        # spreads whose target images changed
//   npm run compile:mind -- spread1 spread3     # these spreads (always recompiled)
//   npm run compile:mind -- --force             # all spreads
//   npm run compile:mind -- --headed            # visible browser window (if headless has no GPU)
//   npm run compile:mind -- --browser <path>    # this Chrome/Chromium/Edge (or env MIND_BROWSER)
//
// Browser: your installed Chrome, else Edge, else Playwright's Chromium (`npx playwright install
// chromium`). The WebGL renderer is printed – "SwiftShader" / "llvmpipe" means software WebGL (slow).
//
// Steps: `node dist/index.js --targets` puts each spread's target images in MindAR order into
// mind-ar/<spread>/ with source.sha256 → compile in the browser → content/spreads/<spread>/<mind> and
// <mind>.sha256 → full content build.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { chromium } from "playwright-core";

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(SCRIPTS, "..");
const MINDAR_DIR = path.join(ROOT, "mind-ar");
const SPREADS_DIR = path.join(ROOT, "content/spreads");
const VENDOR_DIR = path.join(ROOT, "client/src/vendor/mind-ar");
const IMAGE = /\.(jpe?g|png|webp)$/i;
const ORIGIN = "http://mind.local";

const args = process.argv.slice(2);
const option = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const flag = name => {
  const i = args.indexOf(name);
  return i >= 0 && args.splice(i, 1).length > 0;
};
const browserPath = option("--browser") ?? process.env.MIND_BROWSER;
const force = flag("--force");
const headed = flag("--headed");
const requested = args;

const contentBuild = (...flags) =>
  spawnSync(process.execPath, ["dist/index.js", ...flags], { cwd: SCRIPTS, stdio: "inherit" }).status;

// 1. Target images per spread, in MindAR order
if (contentBuild("--targets") !== 0) process.exit(1);

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
      .sort((a, b) => parseInt(a) - parseInt(b));
    return { id, dir, out, hash, images, stale: hash !== compiledFrom };
  });

const unknown = requested.filter(id => !spreads.some(s => s.id === id));
if (unknown.length) {
  console.error(`❌ Unknown spread(s): ${unknown.join(", ")}`);
  process.exit(1);
}
const todo = spreads.filter(s => force || requested.length || s.stale);
if (!todo.length) {
  console.log("\n✅ Every .mind is up to date. `--force` recompiles all.");
  process.exit(0);
}
const empty = todo.filter(s => !s.images.length);
if (empty.length) {
  console.error(`❌ No target images: ${empty.map(s => s.id).join(", ")}`);
  process.exit(1);
}

// 2. Browser
async function launch() {
  const options = { headless: !headed, args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] };
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

const browser = await launch();
try {
  const page = await browser.newPage();
  let files = {};
  await page.route(`${ORIGIN}/**`, route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (!name) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>compile-mind</title>" });
    if (name.startsWith("vendor/")) {
      return route.fulfill({ path: path.join(VENDOR_DIR, path.basename(name)), contentType: "text/javascript" });
    }
    return files[name] ? route.fulfill({ path: files[name] }) : route.fulfill({ status: 404 });
  });
  page.on("pageerror", error => console.error(`   page: ${error.message}`));
  await page.goto(`${ORIGIN}/`);
  let current = "";
  await page.exposeFunction("progress", percent => process.stdout.write(`\r   ${current} ${percent.toFixed(0).padStart(3)}%`));

  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  console.log(`\n🧭 ${browser.browserType().name()} ${browser.version()}, WebGL: ${renderer ?? "none"}`);
  if (!renderer) throw new Error("The browser has no WebGL.");
  if (/swiftshader|llvmpipe|software/i.test(renderer)) {
    console.warn("⚠️  Software WebGL – compiling works but is slow. Try --headed or another --browser.");
  }

  // 3. Compile
  for (const spread of todo) {
    current = spread.id;
    files = Object.fromEntries(spread.images.map(f => [`image/${f}`, path.join(spread.dir, f)]));
    console.log(`\n🧩 ${spread.id}: ${spread.images.join(", ")}`);
    const started = Date.now();
    const base64 = await page.evaluate(async images => {
      const { Compiler } = await import("/vendor/mindar-image.prod.js");
      const loaded = await Promise.all(
        images.map(
          name =>
            new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error(`Can't load ${name}`));
              img.src = `/image/${encodeURIComponent(name)}`;
            }),
        ),
      );
      const compiler = new Compiler();
      await compiler.compileImageTargets(loaded, percent => window.progress(percent));
      const bytes = compiler.exportData();
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    }, spread.images);
    fs.writeFileSync(spread.out, Buffer.from(base64, "base64"));
    fs.writeFileSync(`${spread.out}.sha256`, `${spread.hash}\n`);
    const kb = Math.round(fs.statSync(spread.out).size / 1024);
    console.log(`\r   ✅ ${path.relative(ROOT, spread.out)} (${kb} KB, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
} finally {
  await browser.close();
}

// 4. Content build with the new .mind files
console.log("\n🔄 Content build");
process.exit(contentBuild());
