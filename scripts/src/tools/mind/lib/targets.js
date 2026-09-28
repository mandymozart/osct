// The spreads' target images, in MindAR order (written to mind-ar/ by the content build), with the
// per-image cache file each one compiles to.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { CACHE_DIR, MINDAR_DIR, SCRIPTS, SPREADS_DIR, VENDOR_DIR } from "./paths.js";

const IMAGE = /\.(jpe?g|png|webp)$/i;

/** Run the content build: no flags = full build (output shown), `--targets` = only refresh mind-ar/ */
export const contentBuild = (...flags) =>
  spawnSync(process.execPath, ["dist/index.js", ...flags], { cwd: SCRIPTS, stdio: flags.length ? "pipe" : "inherit" });

/** Refresh mind-ar/ from the content; returns an error text or null */
export function refreshTargets() {
  const result = contentBuild("--targets");
  return result.status === 0 ? null : `${result.stdout}${result.stderr}`.trim() || "the content build failed";
}

/** JPEG / PNG size from the file header */
export function imageSize(buffer) {
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
function compilerId() {
  const hash = createHash("sha256");
  for (const file of fs.readdirSync(VENDOR_DIR).filter(f => f.endsWith(".js")).sort()) hash.update(fs.readFileSync(path.join(VENDOR_DIR, file)));
  return hash.digest("hex").slice(0, 12);
}

/**
 * Spreads (all, or the requested ids) with their images and state:
 * { id, out, hash, images[{ spread, index, name, file, width, height, pixels, cache }], state }
 * state: "new" (no .mind yet) | "changed" (images differ from the compiled ones) | "unknown" (no
 * fingerprint) | "ok"
 */
export function readSpreads(requested = []) {
  const compiler = compilerId();
  return fs
    .readdirSync(MINDAR_DIR)
    .filter(id => !requested.length || requested.includes(id))
    .sort()
    .map(id => {
      const dir = path.join(MINDAR_DIR, id);
      const { mind } = yaml.load(fs.readFileSync(path.join(SPREADS_DIR, id, "spread.yaml"), "utf8"));
      const out = path.join(SPREADS_DIR, id, mind);
      const hash = fs.readFileSync(path.join(dir, "source.sha256"), "utf8").trim();
      const compiledFrom = fs.existsSync(`${out}.sha256`) ? fs.readFileSync(`${out}.sha256`, "utf8").trim() : null;
      const state = !fs.existsSync(out) ? "new" : compiledFrom === null ? "unknown" : compiledFrom === hash ? "ok" : "changed";
      const images = fs
        .readdirSync(dir)
        .filter(f => IMAGE.test(f))
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(name => {
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
            cache: path.join(CACHE_DIR, `${key}-${compiler}.mind`),
          };
        });
      return { id, out, hash, images, state };
    });
}

/** Each image once (the same picture on two spreads compiles once), largest first */
export function uniqueImages(spreads) {
  const unique = new Map();
  for (const image of spreads.flatMap(s => s.images)) if (!unique.has(image.cache)) unique.set(image.cache, image);
  return [...unique.values()].sort((a, b) => b.pixels - a.pixels);
}
