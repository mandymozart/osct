// The spreads' target images, in MindAR order (written to .mindar/targets/ by the content build), with the
// per-image cache file each one compiles to.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { CONTENT_DIR, MIND_CACHE_DIR, MIND_HASH_SUFFIX, MIND_SOURCE_FILE, MINDAR_DIR, MINDAR_VENDOR_DIR, SCRIPTS_DIR } from "../config";

const IMAGE = /\.(jpe?g|png|webp)$/i;

export interface TargetImage {
  spread: string;
  index: number; // MindAR index on the spread
  name: string; // original file name
  file: string; // copy in .mindar/targets/<spread>/
  width: number;
  height: number;
  pixels: number;
  cache: string; // compiled single-image .mind in .mindar/cache/
}

/** new: no .mind yet · changed: images differ from the compiled ones · unknown: no fingerprint · ok */
export type SpreadState = "new" | "changed" | "unknown" | "ok";

export interface SpreadTargets {
  id: string;
  out: string; // content/spreads/<id>/<name>.mind
  hash: string; // fingerprint of the current target images
  images: TargetImage[];
  state: SpreadState;
}

/** Run the content build (dist/index.js): no flags = full build with output, `--targets` = only refresh .mindar/targets/ */
export const contentBuild = (...flags: string[]): SpawnSyncReturns<string> =>
  spawnSync(process.execPath, ["dist/index.js", ...flags], { cwd: SCRIPTS_DIR, stdio: flags.length ? "pipe" : "inherit", encoding: "utf8" });

/** Refresh .mindar/targets/ from the content; returns an error text or null */
export function refreshTargets(): string | null {
  const result = contentBuild("--targets");
  return result.status === 0 ? null : `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || "the content build failed";
}

/** JPEG / PNG size from the file header */
export function imageSize(buffer: Buffer): { width: number; height: number } {
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

// Cache key part: the vendored compiler (a MindAR upgrade compiles everything again)
function compilerId(): string {
  const hash = createHash("sha256");
  for (const file of fs.readdirSync(MINDAR_VENDOR_DIR).filter(f => f.endsWith(".js")).sort()) {
    hash.update(fs.readFileSync(path.join(MINDAR_VENDOR_DIR, file)));
  }
  return hash.digest("hex").slice(0, 12);
}

/** The .mind file of a spread (from its spread.yaml) */
export function mindFile(spread: string): string {
  const { mind } = yaml.load(fs.readFileSync(path.join(CONTENT_DIR, "spreads", spread, "spread.yaml"), "utf8")) as { mind: string };
  return path.join(CONTENT_DIR, "spreads", spread, mind);
}

/** Fingerprint of a spread's current target images (null before the content build wrote .mindar/targets/) */
export function currentFingerprint(spread: string): string | null {
  const file = path.join(MINDAR_DIR, spread, MIND_SOURCE_FILE);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : null;
}

/** Spreads (all, or the requested ids) with their images and state */
export function readSpreads(requested: string[] = []): SpreadTargets[] {
  const compiler = compilerId();
  return fs
    .readdirSync(MINDAR_DIR)
    .filter(id => !requested.length || requested.includes(id))
    .sort()
    .map(id => {
      const dir = path.join(MINDAR_DIR, id);
      const out = mindFile(id);
      const hash = currentFingerprint(id) ?? "";
      const compiledFrom = fs.existsSync(`${out}${MIND_HASH_SUFFIX}`) ? fs.readFileSync(`${out}${MIND_HASH_SUFFIX}`, "utf8").trim() : null;
      const state: SpreadState = !fs.existsSync(out) ? "new" : compiledFrom === null ? "unknown" : compiledFrom === hash ? "ok" : "changed";
      const images = fs
        .readdirSync(dir)
        .filter(f => IMAGE.test(f))
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map((name): TargetImage => {
          const file = path.join(dir, name);
          const bytes = fs.readFileSync(file);
          const size = imageSize(bytes);
          const key = createHash("sha256").update(bytes).digest("hex");
          return {
            spread: id,
            index: parseInt(name),
            name: name.replace(/^\d+-/, ""),
            file,
            ...size,
            pixels: size.width * size.height,
            cache: path.join(MIND_CACHE_DIR, `${key}-${compiler}.mind`),
          };
        });
      return { id, out, hash, images, state };
    });
}

/** Each image once (the same picture on two spreads compiles once), largest first */
export function uniqueImages(spreads: SpreadTargets[]): TargetImage[] {
  const unique = new Map<string, TargetImage>();
  for (const image of spreads.flatMap(s => s.images)) if (!unique.has(image.cache)) unique.set(image.cache, image);
  return [...unique.values()].sort((a, b) => b.pixels - a.pixels);
}
