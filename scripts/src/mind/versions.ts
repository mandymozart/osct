// Local version history of the compiled `.mind` files – test a compile on the phone, go back when it
// tracks worse. Independent of git (the content will leave this repository).
//
//   .mindar/history/<spread>/<version>/<name>.mind         the compiled file
//                                           <name>.mind.sha256   fingerprint of the target images it was made from
//                                           meta.json            date, note, images, GPU, timings, size
//
// <version> = <date>_<time>-<first 8 of the .mind's sha256>, sortable. The same bytes are stored once
// per spread. The newest KEEP versions per spread are kept, plus whatever is current.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const KEEP = 20;

export interface VersionImage {
  index: number;
  name: string;
  width: number;
  height: number;
  keyframes?: number;
  points?: number;
  ms?: number;
  cached?: boolean;
}

/** What a compile passes in; date defaults to now */
export interface VersionInput {
  date?: string | Date;
  note?: string;
  browser?: string;
  renderer?: string;
  sourceHash?: string;
  images?: VersionImage[];
}

export interface VersionMeta extends Omit<VersionInput, "date"> {
  date: string;
  file: string;
  bytes: number;
  mindHash: string;
}

export interface Version {
  id: string;
  dir: string;
  mindHash: string;
  meta: VersionMeta;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const stamp = (date: Date) => date.toISOString().replace(/\.\d+Z$/, "").replace("T", "_").replace(/:/g, "-");

/** Versions of a spread, oldest first */
export function listVersions(historyDir: string, spread: string): Version[] {
  const dir = path.join(historyDir, spread);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(id => fs.existsSync(path.join(dir, id, "meta.json")))
    .sort()
    .map(id => {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, id, "meta.json"), "utf8")) as VersionMeta;
      return { id, dir: path.join(dir, id), mindHash: meta.mindHash, meta };
    });
}

/** The version whose bytes are the current `.mind`, if any */
export function currentVersion(historyDir: string, spread: string, mindFile: string): Version | null {
  if (!fs.existsSync(mindFile)) return null;
  const hash = sha256(fs.readFileSync(mindFile));
  return listVersions(historyDir, spread).findLast(v => v.mindHash === hash) ?? null;
}

/** Store the current `.mind` (+ `.sha256`) of a spread as a version, unless those bytes are stored already */
export function saveVersion(historyDir: string, spread: string, mindFile: string, input: VersionInput = {}): Version {
  const bytes = fs.readFileSync(mindFile);
  const mindHash = sha256(bytes);
  const existing = listVersions(historyDir, spread).find(v => v.mindHash === mindHash);
  if (existing) return existing;

  const date = input.date ? new Date(input.date) : new Date();
  const id = `${stamp(date)}-${mindHash.slice(0, 8)}`;
  const dir = path.join(historyDir, spread, id);
  fs.mkdirSync(dir, { recursive: true });
  const name = path.basename(mindFile);
  fs.writeFileSync(path.join(dir, name), bytes);
  if (fs.existsSync(`${mindFile}.sha256`)) fs.copyFileSync(`${mindFile}.sha256`, path.join(dir, `${name}.sha256`));
  const meta: VersionMeta = { ...input, date: date.toISOString(), file: name, bytes: bytes.length, mindHash };
  fs.writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  prune(historyDir, spread, mindFile);
  return { id, dir, mindHash, meta };
}

/** Copy a version back as the spread's `.mind` (+ `.sha256`) */
export function restoreVersion(version: Version, mindFile: string): void {
  const name = version.meta.file;
  fs.copyFileSync(path.join(version.dir, name), mindFile);
  const hashFile = path.join(version.dir, `${name}.sha256`);
  if (fs.existsSync(hashFile)) fs.copyFileSync(hashFile, `${mindFile}.sha256`);
  else fs.rmSync(`${mindFile}.sha256`, { force: true });
}

/** Fingerprint of the target images a version was compiled from */
export function versionSource(version: Version): string | null {
  const file = path.join(version.dir, `${version.meta.file}.sha256`);
  return version.meta.sourceHash ?? (fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : null);
}

function prune(historyDir: string, spread: string, mindFile: string): void {
  const versions = listVersions(historyDir, spread);
  const current = currentVersion(historyDir, spread, mindFile);
  for (const version of versions.slice(0, Math.max(0, versions.length - KEEP))) {
    if (version.id !== current?.id) fs.rmSync(version.dir, { recursive: true, force: true });
  }
}
