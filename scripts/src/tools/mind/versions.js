// Local version history of the compiled `.mind` files – test a compile on the phone, go back when it
// tracks worse. Independent of git (the content will leave this repository).
//
//   mind-history/<spread>/<version>/<name>.mind          the compiled file
//                                   <name>.mind.sha256   fingerprint of the target images it was made from
//                                   meta.json            date, note, images, GPU, timings, size
//
// <version> = <date>_<time>-<first 8 of the .mind's sha256>, sortable. The same bytes are stored once
// per spread. The newest KEEP versions per spread are kept, plus whatever is current.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const KEEP = 20;

const sha256 = data => createHash("sha256").update(data).digest("hex");
const stamp = date => date.toISOString().replace(/\.\d+Z$/, "").replace("T", "_").replace(/:/g, "-");

/** Versions of a spread, oldest first: { id, dir, mindHash, meta } */
export function listVersions(historyDir, spread) {
  const dir = path.join(historyDir, spread);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(id => fs.existsSync(path.join(dir, id, "meta.json")))
    .sort()
    .map(id => {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, id, "meta.json"), "utf8"));
      return { id, dir: path.join(dir, id), mindHash: meta.mindHash, meta };
    });
}

/** The version whose bytes are the current `.mind`, if any */
export function currentVersion(historyDir, spread, mindFile) {
  if (!fs.existsSync(mindFile)) return null;
  const hash = sha256(fs.readFileSync(mindFile));
  return listVersions(historyDir, spread).findLast(v => v.mindHash === hash) ?? null;
}

/**
 * Store the current `.mind` (+ `.sha256`) of a spread as a version, unless those bytes are stored already.
 * Returns the version (new or existing).
 */
export function saveVersion(historyDir, spread, mindFile, meta = {}) {
  const bytes = fs.readFileSync(mindFile);
  const mindHash = sha256(bytes);
  const existing = listVersions(historyDir, spread).find(v => v.mindHash === mindHash);
  if (existing) return existing;

  const date = meta.date ? new Date(meta.date) : new Date();
  const id = `${stamp(date)}-${mindHash.slice(0, 8)}`;
  const dir = path.join(historyDir, spread, id);
  fs.mkdirSync(dir, { recursive: true });
  const name = path.basename(mindFile);
  fs.writeFileSync(path.join(dir, name), bytes);
  if (fs.existsSync(`${mindFile}.sha256`)) fs.copyFileSync(`${mindFile}.sha256`, path.join(dir, `${name}.sha256`));
  const full = { ...meta, date: date.toISOString(), file: name, bytes: bytes.length, mindHash };
  fs.writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify(full, null, 2)}\n`);
  prune(historyDir, spread, mindFile);
  return { id, dir, mindHash, meta: full };
}

/** Copy a version back as the spread's `.mind` (+ `.sha256`) */
export function restoreVersion(version, mindFile) {
  const name = version.meta.file;
  fs.copyFileSync(path.join(version.dir, name), mindFile);
  const hashFile = path.join(version.dir, `${name}.sha256`);
  if (fs.existsSync(hashFile)) fs.copyFileSync(hashFile, `${mindFile}.sha256`);
  else fs.rmSync(`${mindFile}.sha256`, { force: true });
}

function prune(historyDir, spread, mindFile) {
  const versions = listVersions(historyDir, spread);
  const current = currentVersion(historyDir, spread, mindFile);
  for (const version of versions.slice(0, Math.max(0, versions.length - KEEP))) {
    if (version.id !== current?.id) fs.rmSync(version.dir, { recursive: true, force: true });
  }
}
