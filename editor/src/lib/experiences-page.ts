import type { GameConfiguration } from "@engine/types";
import type { ExperienceDeletionImpact, ExportDownload, LiveIn, PublishedVersion, RecentChange } from "./api";
import type { PluginFiles } from "@shared/api/editor";
import { kindWord } from "./history";
import { ago } from "./mcp-setup";
import { whenText } from "./publish-overlay";
import { readerAddress } from "./new-experience";

/**
 * The experiences page (#348, docs/editor.md "Experiences"), the pure part: the books on the left, a context column on
 * the right – quick access (New, Import, Last worked on), the New flow step by step, a selected book's sheet (Open,
 * Export, Replace…, Versions with make live). These are its words and its rules; the page and its components draw them.
 */

// ── the reader address while a slug is typed ────────────────────────────────────────────────────────

/**
 * The reader's address the Name step shows: the whole address once there is a slug, else the instance with a plain
 * placeholder – never a URL-encoded `<slug>` (`%3Cslug%3E`, the bug seen on staging)
 */
export const addressPreview = (origin: string, slug: string): { text: string; placeholder: boolean } =>
  slug ? { text: readerAddress(origin, slug), placeholder: false } : { text: `${origin.replace(/\/+$/, "")}/…/`, placeholder: true };

// ── Last worked on ──────────────────────────────────────────────────────────────────────────────────

/** A row of *Last worked on*: where, when, who – and the editor's path that opens it */
export interface RecentPlace {
  experience: string;
  book: string;
  /** The scene's label, or what the change was of when it is on no scene (`Code`, `Experience`, …) */
  place: string;
  /** The entry or the panel, when known */
  detail: string | null;
  when: string;
  /** Who, when it is not the person looking (an AI connection's name in brackets) */
  who: string | null;
  /** The path below the editor's base: `<experience>/<scene>/` (with `?tab=` for a panel), or `<experience>/` */
  path: string;
}

/** The panel a change of this kind lives in, by the scene workspace's `?tab=` (null: the Inspector, the default) */
const PANEL_OF: Record<string, { tab: string; name: string }> = {
  plugin: { tab: "code", name: "Code" },
  asset: { tab: "library", name: "Library" },
  environment: { tab: "environment", name: "Environment" },
  logic: { tab: "logic", name: "Logic" },
  variables: { tab: "logic", name: "Logic" },
};

/**
 * The latest places worked on across the instance (newest first, `max` of them): one row per experience and scene – the
 * newest change there –, a change on no scene one row per experience and kind. A change on no scene opens the
 * experience's first scene in the panel it belongs to (`?tab=`), or the experience page.
 */
export const recentPlaces = (changes: readonly RecentChange[], me: string | null, now = Date.now(), max = 5, initialScenes: Readonly<Record<string, string>> = {}): RecentPlace[] => {
  const seen = new Set<string>();
  const rows: RecentPlace[] = [];
  for (const c of changes) {
    const key = c.scene ? `${c.experience}/scene/${c.scene}` : `${c.experience}/kind/${PANEL_OF[c.kind]?.tab ?? c.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const panel = PANEL_OF[c.kind];
    const sceneId = c.scene ?? (panel ? initialScenes[c.experience] : undefined);
    const tab = panel ? `?tab=${panel.tab}` : "";
    const path = sceneId ? `${c.experience}/${sceneId}/${tab}` : `${c.experience}/`;
    const who = c.user && c.user === me ? null : c.token ? `${c.user ?? "?"} (${c.token})` : c.user;
    rows.push({
      experience: c.experience,
      book: c.experienceTitle || c.experience,
      place: c.scene ? (c.sceneLabel ?? c.scene) : panel?.name ?? kindWord(c.kind),
      detail: c.entry ?? (c.scene && panel ? panel.name : null),
      when: ago(c.at, now),
      who,
      path,
    });
    if (rows.length >= max) break;
  }
  return rows;
};

// ── Versions ────────────────────────────────────────────────────────────────────────────────────────

/** A row of the sheet's Versions: a publish of the log, whether it is what readers get now, and whether it can be made live */
export interface VersionRow {
  id: string;
  build: string;
  env: string;
  when: string;
  who: string;
  note: string | null;
  /** Readers of `env` get this build now – the newest row of that build where its env serves it */
  live: boolean;
  /** An older build of this instance's own environment, not live: *make live* offers it (one row per build, its newest) */
  canMakeLive: boolean;
}

/**
 * The publish log as the sheet lists it (newest first): the live mark on the newest row of each environment's live
 * build, *make live* on the newest row of every other build of this instance's environment (`ownEnv`) – builds are kept
 * in the store, so each can be made current again; another environment's are made live from its own editor
 */
export const versionRows = (versions: readonly PublishedVersion[], live: readonly LiveIn[], ownEnv: string | null, now = new Date()): VersionRow[] => {
  const liveBuild = new Map(live.map(l => [l.env, l.build]));
  const marked = new Set<string>();
  const offered = new Set<string>();
  return versions.map(v => {
    const key = `${v.env} ${v.build}`;
    const isLive = liveBuild.get(v.env) === v.build && !marked.has(v.env);
    if (isLive) marked.add(v.env);
    const canMakeLive = !isLive && v.env === ownEnv && liveBuild.get(v.env) !== v.build && !offered.has(key);
    if (v.env === ownEnv) offered.add(key);
    return { id: v.id, build: v.build, env: v.env, when: whenText(v.publishedAt, now), who: v.publishedBy ?? "someone", note: v.note, live: isLive, canMakeLive };
  });
};

/** The make-live confirm: what happens, in the person's words (Tilman, 2026-11-22) */
export const makeLiveQuestion = (row: Pick<VersionRow, "when" | "env">): string =>
  `Make the version of ${row.when} live on ${row.env} again? Readers get it on their next start. The draft is not changed.`;

// ── the cards' keys ─────────────────────────────────────────────────────────────────────────────────

/**
 * The card the arrow keys move the selection to, in a grid of `count` cards with `columns` per row (the + card counts):
 * ← → one, ↑ ↓ one row, Home / End the first / last – null for another key. With nothing selected, any arrow starts at
 * the first card.
 */
export const moveSelection = (index: number | null, key: string, count: number, columns: number): number | null => {
  if (count <= 0) return null;
  const last = count - 1;
  const cols = Math.max(1, columns);
  if (index === null) return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(key) ? 0 : key === "End" ? last : null;
  switch (key) {
    case "ArrowLeft": return Math.max(0, index - 1);
    case "ArrowRight": return Math.min(last, index + 1);
    case "ArrowUp": return index - cols >= 0 ? index - cols : index;
    case "ArrowDown": return index + cols <= last ? index + cols : index;
    case "Home": return 0;
    case "End": return last;
    default: return null;
  }
};

// ── an export file as the import reads it ───────────────────────────────────────────────────────────

/** What a chosen file is to the import: an export file (#348) with its body, or a bare game.config.json */
export type ReadFile =
  | { kind: "export"; configuration: GameConfiguration; files: unknown; assetsBase?: string; sources: PluginFiles[]; of: { experience: string; title: string; build: string; exportedAt: string } }
  | { kind: "configuration"; configuration: GameConfiguration };

/**
 * A file the Import reads: an export file (`format: "osct-export"` – the import body it is, with what it is of), else a
 * game configuration as before. Throws a line for a file that is neither.
 */
export const readImportFile = (name: string, text: string): ReadFile => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${name} is not JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} is no export and no game configuration.`);
  const record = value as Partial<ExportDownload> & Record<string, unknown>;
  if (record.format === "osct-export") {
    if (!record.configuration || typeof record.configuration !== "object") throw new Error(`${name} is an export without its configuration.`);
    if (typeof record.formatVersion === "number" && record.formatVersion > 2) throw new Error(`${name} is an export of a newer format (${record.formatVersion}) – update the editor.`);
    // formatVersion 2 (#352): every plugin with its files; a file of format 1 carried one source each – its index.ts
    const sources: PluginFiles[] = (Array.isArray(record.sources) ? (record.sources as unknown[]) : []).flatMap(item => {
      const s = item as { id?: unknown; files?: unknown; source?: unknown } | null;
      if (!s || typeof s.id !== "string") return [];
      if (Array.isArray(s.files)) return [{ id: s.id, files: (s.files as PluginFiles["files"]).filter(f => f && typeof f.name === "string" && typeof f.text === "string") }];
      return typeof s.source === "string" ? [{ id: s.id, files: [{ name: "index.ts", text: s.source }] }] : [];
    });
    return {
      kind: "export",
      configuration: record.configuration as unknown as GameConfiguration,
      files: record.files ?? {},
      ...(typeof record.assetsBase === "string" ? { assetsBase: record.assetsBase } : {}),
      sources,
      of: { experience: String(record.experience ?? ""), title: String(record.title ?? ""), build: String(record.build ?? ""), exportedAt: String(record.exportedAt ?? "") },
    };
  }
  return { kind: "configuration", configuration: value as GameConfiguration };
};

/** The column's heading per state – the region's accessible name */
export const columnLabel = (state: "quick" | "new" | "book" | "replace", title?: string): string =>
  state === "quick" ? "Quick access" : state === "new" ? "New experience" : state === "replace" ? `Replace the draft of ${title ?? "the experience"}` : `${title ?? "The experience"}`;

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────────

/** What deleting an experience takes, in words for the warning – the parts that are not zero (#348) */
export const deletionTakes = (counts: ExperienceDeletionImpact["counts"]): string[] => {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return [
    n(counts.scenes, "scene", "scenes") + (counts.entries ? ` with ${n(counts.entries, "entry", "entries")}` : ""),
    counts.plugins ? n(counts.plugins, "plugin source", "plugin sources") : "",
    counts.files ? `the Library's records of ${n(counts.files, "file", "files")}` : "",
    counts.changes ? `the history (${n(counts.changes, "change", "changes")}) – no undo brings it back` : "",
    counts.versions ? `the publish log (${n(counts.versions, "version", "versions")}) – no make live afterwards` : "",
  ].filter(Boolean);
};

/** The delete button is armed only once the experience's id is typed exactly (spaces around it ignored) */
export const deleteArmed = (typed: string, id: string): boolean => typed.trim() === id;
