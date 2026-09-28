// npm run mind:history / mind:restore – the versions of the compiled `.mind` files (compile.ts stores
// them in mind-history/): list them, put one back. Local and independent of git.
//
//   npm run mind:history                      all spreads
//   npm run mind:history spread1              one spread, with its images per version
//   npm run mind:restore spread1 previous     the version before the current one
//   npm run mind:restore spread1 3            version number 3 of the list (or latest, or an id)
//   npm run mind:restore spread1 3 --force    also a version made from other target images
//
// Restoring copies the version to content/spreads/<spread>/<name>.mind (+ .sha256) and runs the
// content build, so the dev server serves it right away.
import fs from "node:fs";
import path from "node:path";
import { CONTENT_DIR, MIND_HISTORY_DIR, projectRoot } from "../config";
import { parseOptions } from "../lib/cli";
import { bold, cyan, dim, fail, green, kb, yellow } from "../lib/console";
import { contentBuild, currentFingerprint, mindFile, refreshTargets } from "./targets";
import { currentVersion, KEEP, listVersions, restoreVersion, type Version, versionSource } from "./versions";

interface SpreadInfo {
  id: string;
  mindFile: string;
  source: string | null; // fingerprint of the current target images
}

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

let parsed: ReturnType<typeof parseOptions>;
try {
  parsed = parseOptions(process.argv.slice(2), { flags: ["force"] });
} catch (error) {
  fail((error as Error).message);
}
const force = Boolean(parsed!.options.force);
const [command, ...rest] = parsed!.rest;

function spreadInfo(id: string): SpreadInfo | null {
  if (!fs.existsSync(path.join(CONTENT_DIR, "spreads", id, "spread.yaml"))) return null;
  return { id, mindFile: mindFile(id), source: currentFingerprint(id) };
}

function show(spread: SpreadInfo, detailed: boolean): void {
  const versions = listVersions(MIND_HISTORY_DIR, spread.id);
  const current = currentVersion(MIND_HISTORY_DIR, spread.id, spread.mindFile);
  console.log(`\n${bold(spread.id)} ${dim(path.relative(projectRoot, spread.mindFile))}`);
  if (!versions.length) {
    console.log(dim("  no versions yet – `npm run compile:mind` stores them"));
    return;
  }
  if (!current) console.log(yellow("  ● current file is not in the history (changed by hand?)"));
  versions.forEach((version, i) => {
    const { meta } = version;
    const source = versionSource(version);
    const other = spread.source && source && source !== spread.source;
    const compiledMs = (meta.images ?? []).reduce((n, image) => n + (image.ms ?? 0), 0);
    const parts = [
      `${version.id === current?.id ? green("●") : " "} ${bold(String(i + 1).padStart(2))}`,
      when(meta.date),
      kb(meta.bytes).padStart(7),
      meta.images ? `${meta.images.length} targets` : "",
      meta.renderer ? cyan(meta.renderer.replace(/^ANGLE \((.*)\)$/, "$1").slice(0, 48)) : "",
      compiledMs ? dim(seconds(compiledMs)) : "",
      meta.note ? `"${meta.note}"` : "",
      other ? yellow("other target images") : "",
      dim(version.id),
    ];
    console.log(`  ${parts.filter(Boolean).join("  ")}`);
    if (detailed && meta.images) {
      for (const image of meta.images) {
        const stats = image.cached ? dim("cached") : dim(`${image.keyframes} sizes · ${image.points} features · ${seconds(image.ms ?? 0)}`);
        console.log(`        ${dim(`[${image.index}]`)} ${image.name} ${dim(`${image.width}×${image.height}`)} ${stats}`);
      }
    }
  });
}

function pick(versions: Version[], current: Version | null, which: string): Version | null {
  if (which === "previous") {
    const i = versions.findIndex(v => v.id === current?.id);
    return i > 0 ? versions[i - 1] : null;
  }
  if (which === "latest") return versions.at(-1) ?? null;
  if (/^\d{1,3}$/.test(which)) return versions[Number(which) - 1] ?? null;
  const matches = versions.filter(v => v.id.startsWith(which));
  return matches.length === 1 ? matches[0] : null;
}

// Fresh fingerprints of the current target images
refreshTargets();

if (!command || command === "list" || spreadInfo(command)) {
  const ids = command && command !== "list" ? [command] : rest.length ? rest : fs.existsSync(MIND_HISTORY_DIR) ? fs.readdirSync(MIND_HISTORY_DIR).sort() : [];
  const spreads = ids.map(spreadInfo).filter((s): s is SpreadInfo => s !== null);
  if (!spreads.length) console.log(dim("No .mind versions yet – `npm run compile:mind` stores them."));
  for (const spread of spreads) show(spread, ids.length === 1);
  console.log(dim(`\n● = current · newest ${KEEP} kept per spread · go back: npm run mind:restore <spread> previous (or a number)`));
} else if (command === "restore") {
  const [id, which = "previous"] = rest;
  const spread = id ? spreadInfo(id) : null;
  if (!spread) fail(`Unknown spread "${id ?? ""}". Usage: npm run mind:restore <spread> <number | previous | latest | id>`);
  const versions = listVersions(MIND_HISTORY_DIR, spread!.id);
  const current = currentVersion(MIND_HISTORY_DIR, spread!.id, spread!.mindFile);
  const version = pick(versions, current, which);
  if (!version) {
    show(spread!, false);
    fail(`${spread!.id}: no version "${which}".`);
  }
  if (version!.id === current?.id) {
    console.log(green(`✔ ${spread!.id}: version ${version!.id} is already current.`));
    process.exit(0);
  }
  const source = versionSource(version!);
  if (spread!.source && source && source !== spread!.source && !force) {
    fail(
      `${spread!.id}: version ${version!.id} was compiled from other target images than the spread has now\n` +
        `  (the content build would stop with "stale"). Restore the images too, or use --force.`,
    );
  }
  restoreVersion(version!, spread!.mindFile);
  console.log(green(`✔ ${spread!.id}: restored ${bold(version!.id)}`) + (version!.meta.note ? ` "${version!.meta.note}"` : ""));
  console.log(dim("\nContent build"));
  process.exit(contentBuild().status ?? 1);
} else {
  fail(`Unknown command "${command}". Use: npm run mind:history [spread] · npm run mind:restore <spread> <version>`);
}
