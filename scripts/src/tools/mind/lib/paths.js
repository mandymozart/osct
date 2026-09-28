// Folders the .mind tools work with
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const ROOT = path.resolve(SCRIPTS, "..");
export const MINDAR_DIR = path.join(ROOT, "mind-ar"); // target images per spread, in MindAR order
export const SPREADS_DIR = path.join(ROOT, "content/spreads");
export const VENDOR_DIR = path.join(ROOT, "client/src/vendor/mind-ar"); // MindAR, unchanged
export const CACHE_DIR = path.join(SCRIPTS, ".cache/mind"); // one compiled .mind per image
export const BROWSER_DIR = path.join(SCRIPTS, ".cache/mind-browser"); // browser profiles (GPU program cache)
export const BENCHMARK_FILE = path.join(SCRIPTS, ".cache/mind-benchmark.json");
export const HISTORY_DIR = path.join(ROOT, "mind-history");
