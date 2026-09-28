// Versions of the compiled `.mind` files (written by compile.js into mind-history/) – list them,
// put one back. Local and independent of git.
//
//   cd scripts
//   npm run mind:history                            # all spreads
//   npm run mind:history -- spread1                 # one spread, with its images per version
//   npm run mind:restore -- spread1 previous        # the version before the current one
//   npm run mind:restore -- spread1 3               # version number 3 of the list
//   npm run mind:restore -- spread1 2026-09-28_05   # version id (or its start)
//   npm run mind:restore -- spread1 3 --force       # also a version made from other target images
//
// Restoring copies the version to content/spreads/<spread>/<name>.mind (+ .sha256) and runs the
// content build, so the dev server serves it right away.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { parseOptions } from "../lib/cli.js";
import { currentVersion, KEEP, listVersions, restoreVersion } from "./versions.js";

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(SCRIPTS, "..");
const HISTORY_DIR = path.join(ROOT, "mind-history");
const MINDAR_DIR = path.join(ROOT, "mind-ar");
const SPREADS_DIR = path.join(ROOT, "content/spreads");

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = code => text => (tty ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const [bold, dim, green, yellow, red, cyan] = [1, 2, 32, 33, 31, 36].map(paint);
const kb = bytes => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const when = iso => new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
const seconds = ms => `${(ms / 1000).toFixed(1)}s`;

const { options, rest: args } = parseOptions(process.argv.slice(2), { flags: ["force"] });
const force = Boolean(options.force);
const [command, ...rest] = args;
const contentBuild = (...flags) =>
  spawnSync(process.execPath, ["dist/index.js", ...flags], { cwd: SCRIPTS, stdio: flags.length ? "pipe" : "inherit" }).status;

function spreadInfo(id) {
  const yamlFile = path.join(SPREADS_DIR, id, "spread.yaml");
  if (!fs.existsSync(yamlFile)) return null;
  const { mind } = yaml.load(fs.readFileSync(yamlFile, "utf8"));
  const mindFile = path.join(SPREADS_DIR, id, mind);
  // Fingerprint of the spread's current target images (written by `dist/index.js --targets`)
  const sourceFile = path.join(MINDAR_DIR, id, "source.sha256");
  const source = fs.existsSync(sourceFile) ? fs.readFileSync(sourceFile, "utf8").trim() : null;
  return { id, mindFile, source };
}

const versionSource = version => {
  const file = path.join(version.dir, `${version.meta.file}.sha256`);
  return version.meta.sourceHash ?? (fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : null);
};

function show(spread, detailed) {
  const versions = listVersions(HISTORY_DIR, spread.id);
  const current = currentVersion(HISTORY_DIR, spread.id, spread.mindFile);
  console.log(`\n${bold(spread.id)} ${dim(path.relative(ROOT, spread.mindFile))}`);
  if (!versions.length) {
    console.log(dim("  no versions yet – `npm run compile:mind` stores them"));
    return;
  }
  if (!current) console.log(yellow("  ● current file is not in the history (changed by hand?)"));
  versions.forEach((version, i) => {
    const { meta } = version;
    const isCurrent = version.id === current?.id;
    const other = spread.source && versionSource(version) && versionSource(version) !== spread.source;
    const compiledMs = (meta.images ?? []).reduce((n, image) => n + (image.ms ?? 0), 0);
    const parts = [
      `${isCurrent ? green("●") : " "} ${bold(String(i + 1).padStart(2))}`,
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
        const stats = image.cached ? dim("cached") : dim(`${image.keyframes} kf · ${image.points} pts · ${seconds(image.ms)}`);
        console.log(`        ${dim(`[${image.index}]`)} ${image.name} ${dim(`${image.width}×${image.height}`)} ${stats}`);
      }
    }
  });
}

function pick(versions, current, which) {
  if (which === "previous") {
    const i = versions.findIndex(v => v.id === current?.id);
    return i > 0 ? versions[i - 1] : null;
  }
  if (which === "latest") return versions.at(-1);
  if (/^\d{1,3}$/.test(which)) return versions[Number(which) - 1] ?? null;
  const matches = versions.filter(v => v.id.startsWith(which));
  return matches.length === 1 ? matches[0] : null;
}

// Fresh fingerprints of the current target images (quiet; skipped when the build tool isn't built yet)
if (fs.existsSync(path.join(SCRIPTS, "dist/index.js"))) contentBuild("--targets");

if (!command || command === "list" || spreadInfo(command)) {
  const ids = command && command !== "list" ? [command] : rest.length ? rest : fs.existsSync(HISTORY_DIR) ? fs.readdirSync(HISTORY_DIR).sort() : [];
  const spreads = ids.map(spreadInfo).filter(Boolean);
  if (!spreads.length) console.log(dim(`No .mind versions in ${path.relative(ROOT, HISTORY_DIR)}/ yet – \`npm run compile:mind\` stores them.`));
  for (const spread of spreads) show(spread, ids.length === 1);
  console.log(dim(`\n● = current · newest ${KEEP} kept per spread · restore: npm run mind:restore -- <spread> <number | previous | id>`));
} else if (command === "restore") {
  const [id, which = "previous"] = rest;
  const spread = id && spreadInfo(id);
  if (!spread) {
    console.error(red(`✖ Unknown spread "${id ?? ""}". Usage: npm run mind:restore -- <spread> <number | previous | latest | id>`));
    process.exit(1);
  }
  const versions = listVersions(HISTORY_DIR, spread.id);
  const current = currentVersion(HISTORY_DIR, spread.id, spread.mindFile);
  const version = pick(versions, current, which);
  if (!version) {
    console.error(red(`✖ ${spread.id}: no version "${which}".`));
    show(spread, false);
    process.exit(1);
  }
  if (version.id === current?.id) {
    console.log(green(`✔ ${spread.id}: version ${version.id} is already current.`));
    process.exit(0);
  }
  const source = versionSource(version);
  if (spread.source && source && source !== spread.source && !force) {
    console.error(
      red(`✖ ${spread.id}: version ${version.id} was compiled from other target images than the spread has now`) +
        `\n  (the content build would stop with "stale"). Restore the images too, or use --force.`,
    );
    process.exit(1);
  }
  restoreVersion(version, spread.mindFile);
  console.log(green(`✔ ${spread.id}: restored ${bold(version.id)}`) + (version.meta.note ? ` "${version.meta.note}"` : ""));
  console.log(dim("\nContent build"));
  process.exit(contentBuild() ?? 1);
} else {
  console.error(red(`✖ Unknown command "${command}". Use: list [spread…] | <spread> | restore <spread> <version>`));
  process.exit(1);
}
