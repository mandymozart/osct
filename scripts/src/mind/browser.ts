// The browser that compiles: an installed Chrome/Edge (or Playwright's Chromium) driven by
// playwright-core. Pages load MindAR's own compiler from client/src/vendor/mind-ar/ – WebGL on the GPU.
//
// The browser keeps a profile in scripts/.cache/mind-browser/<browser>/ (one per browser, a profile
// can't be shared between versions): its GPU program cache survives, so only the first run pays the
// one-time GPU setup. All pages share that profile's one context; each job gets its own site
// (mind-1.local, mind-2.local …), which Chrome runs in its own renderer process.
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { MIND_BROWSER_DIR, MINDAR_VENDOR_DIR } from "../config";

export type GpuChoice = "high" | "default";

export interface BrowserOptions {
  browserPath?: string;
  gpu?: GpuChoice;
  angle?: string;
  headed?: boolean;
}

export interface Browser {
  name: string; // e.g. "chrome 141.0.7390.37"
  context: BrowserContext;
  close(): Promise<void>;
}

export interface WebGLInfo {
  vendor: string;
  renderer: string;
}

/** What the page returns for one image */
export interface PageResult {
  mind: string; // base64 single-image .mind
  keyframes: number; // image sizes MindAR looks at
  points: number; // features found
  detectMs: number; // finding features (GPU)
  trackMs: number; // preparing tracking (CPU)
}

// Functions the compile page defines on `window` (see openPage)
declare global {
  interface Window {
    progress(percent: number): void;
    webgl(): WebGLInfo | null;
    compileImage(url: string): Promise<PageResult>;
    mergeMinds(files: string[]): string;
  }
}

export async function launchBrowser({ browserPath, gpu = "high", angle, headed = false }: BrowserOptions): Promise<Browser> {
  const options = {
    headless: !headed,
    args: [
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      ...(gpu === "high" ? ["--force_high_performance_gpu"] : []),
      ...(angle ? [`--use-angle=${angle}`] : []),
    ],
  };
  const open = async (profile: string, extra: { channel?: string; executablePath?: string }): Promise<Browser> => {
    const context = await chromium.launchPersistentContext(path.join(MIND_BROWSER_DIR, profile), { ...options, ...extra });
    // A persistent context opens with one blank page – not needed
    await Promise.all(context.pages().map(page => page.close()));
    const version = context.browser()?.version() ?? "";
    return { name: `${extra.channel ?? "chromium"} ${version}`.trim(), context, close: () => context.close() };
  };
  if (browserPath) return open(`path-${createHash("sha256").update(browserPath).digest("hex").slice(0, 8)}`, { executablePath: browserPath });
  const failures: string[] = [];
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await open(channel ?? "chromium", channel ? { channel } : {});
    } catch (error) {
      failures.push(`${channel ?? "playwright chromium"}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  throw new Error(`No browser found – install Chrome or pass --browser=<path>.\n  ${failures.join("\n  ")}`);
}

// TF.js (inside MindAR) creates its WebGL context without a power preference: on laptops with two GPUs
// the browser may pick the integrated one. Ask for the fast one.
const HIGH_PERFORMANCE = `for (const C of [HTMLCanvasElement, typeof OffscreenCanvas === "undefined" ? null : OffscreenCanvas]) {
  if (!C) continue;
  const getContext = C.prototype.getContext;
  C.prototype.getContext = function (type, attributes) {
    return getContext.call(this, type, /webgl/.test(type) ? { ...attributes, powerPreference: "high-performance" } : attributes);
  };
}`;

export interface CompilePage {
  page: Page;
  close(): Promise<void>;
  webgl(): Promise<WebGLInfo | null>;
  compile(name: string): Promise<PageResult>;
  merge(files: string[]): Promise<string>;
}

export interface PageOptions {
  site?: number; // one per parallel job
  gpu?: GpuChoice;
  images?: Map<string, string>; // name → file the page may load
  onProgress?: (percent: number) => void;
  onError?: (message: string) => void;
}

/** One compile page on its own site (= own renderer process + MindAR worker) */
export async function openPage(browser: Browser, { site = 0, gpu = "high", images = new Map(), onProgress = () => {}, onError = () => {} }: PageOptions = {}): Promise<CompilePage> {
  const origin = `http://mind-${site}.local`;
  const page = await browser.context.newPage();
  await page.route(`${origin}/**`, route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (!name) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>compile-mind</title>" });
    if (name.startsWith("vendor/")) return route.fulfill({ path: path.join(MINDAR_VENDOR_DIR, path.basename(name)), contentType: "text/javascript" });
    const file = name.startsWith("image/") ? images.get(name.slice(6)) : undefined;
    return file ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
  });
  page.on("pageerror", error => onError(error.message));
  if (gpu === "high") await page.addInitScript(HIGH_PERFORMANCE);
  await page.exposeFunction("progress", (percent: number) => onProgress(percent));
  await page.goto(`${origin}/`);
  // Runs in the browser (serialised by Playwright – only what is inside the function is available)
  await page.evaluate(async (compilerUrl: string) => {
    const { Compiler } = (await import(/* @vite-ignore */ compilerUrl)) as { Compiler: any };
    const toBase64 = (bytes: Uint8Array) => {
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    const fromBase64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

    window.webgl = () => {
      const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
      if (!gl) return null;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      };
    };

    // MindAR reports 0–50 % while it finds the image features (GPU), 50–100 % while it prepares
    // tracking (CPU, in its worker)
    window.compileImage = async url => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const compiler = new Compiler();
      const start = performance.now();
      let detected = start;
      await compiler.compileImageTargets([img], (percent: number) => {
        if (percent <= 50.0001) detected = performance.now();
        window.progress(percent);
      });
      const end = performance.now();
      const [data] = compiler.data;
      return {
        mind: toBase64(compiler.exportData()),
        keyframes: data.matchingData.length,
        points: data.matchingData.reduce((n: number, k: { maximaPoints: unknown[]; minimaPoints: unknown[] }) => n + k.maximaPoints.length + k.minimaPoints.length, 0),
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
  }, "/vendor/mindar-image.prod.js");
  return {
    page,
    close: () => page.close(),
    webgl: () => page.evaluate(() => window.webgl()),
    compile: name => page.evaluate(url => window.compileImage(url), `/image/${encodeURIComponent(name)}`),
    merge: files => page.evaluate(list => window.mergeMinds(list), files),
  };
}

/** Software renderer / integrated GPU → a hint, else null */
export function gpuHint(renderer: string, gpu: GpuChoice): string | null {
  if (/swiftshader|llvmpipe|software|microsoft basic/i.test(renderer)) {
    return "Software graphics (no GPU) – works, but slow. Try --headed, --angle=d3d11 or --angle=vulkan.";
  }
  if (gpu === "high" && /intel|uhd|iris|radeon\(tm\) graphics/i.test(renderer) && !/nvidia|geforce|rtx|gtx/i.test(renderer)) {
    return "Looks like the integrated GPU. Windows: Settings → System → Display → Graphics → Chrome → High performance.";
  }
  return null;
}
