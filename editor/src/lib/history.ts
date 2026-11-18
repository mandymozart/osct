import type { BookTree, Change, RevertResult } from "@shared/api/editor";

/**
 * The editor's **history** (#312), the pure part: the steps undo and redo walk, how a saved change reads in words, the
 * History panel's filters and what a revert's prompt says. The runes state (`history.svelte.ts`) asks the server
 * (`POST …/changes/revert`, `…/{id}/revert`, `…/revert-to` – plan, then apply) and keeps the session's undo and redo.
 */

/** Changes saved closer together than this (ms) by one person are one step – one save writes several rows */
export const SAME_SAVE_MS = 1500;
/** Saves of the same thing closer together than this (ms) are one step: an autosaved burst (a drag, a word typed) */
export const BURST_MS = 8000;

/** A thing a change touched: its kind and ref (the book's own JSON is one thing per kind) */
const thing = (c: Pick<Change, "kind" | "ref">): string => `${c.kind}:${c.ref}`;
const time = (c: Pick<Change, "createdAt">): number => Date.parse(c.createdAt);

/**
 * The newest **undo step** among `changes` (newest first): one person's newest change, and the changes before it that
 * belong to the same step – a change set (`set`, a revert), the rows of one save (within `SAME_SAVE_MS`), an autosaved
 * burst of the same thing (within `BURST_MS` of the step's previous change). Its ids, newest first; [] when none.
 */
export const newestStep = (changes: readonly Change[]): string[] => {
  const [first] = changes;
  if (!first) return [];
  const step = [first];
  const things = new Set([thing(first)]);
  for (const c of changes.slice(1)) {
    const previous = step[step.length - 1];
    const gap = time(previous) - time(c);
    const sameSet = !!first.set && c.set === first.set;
    if (sameSet || gap <= SAME_SAVE_MS || (things.has(thing(c)) && gap <= BURST_MS)) {
      step.push(c);
      things.add(thing(c));
    } else break;
  }
  return step.map(c => c.id);
};

/** What undo may take back: the person's own changes of this session that undo or redo did not use up, newest first */
export const undoable = (changes: readonly Change[], me: string, since: number, consumed: ReadonlySet<string>): Change[] =>
  changes.filter(c => c.user === me && time(c) >= since && !consumed.has(c.id));

/** Whether a plan needs the person's look before it is written – anything beyond a plain undo of their own edit */
export const needsPrompt = (result: RevertResult): boolean => {
  const p = result.plan;
  return p.counts.conflict > 0 || p.counts.notRevertable > 0 || p.later > 0 || p.others.length > 0;
};

/**
 * The keys of undo and redo: Ctrl (⌘) + Z undoes, with Shift – or Ctrl + Y – redoes. Not in a text field, a select or
 * the code editor: they keep their own undo. null for any other key.
 */
export const undoKey = (event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "target">): "undo" | "redo" | null => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key !== "z" && key !== "y") return null;
  const target = event.target as Element | null;
  if (target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], .monaco-editor")) return null;
  return key === "y" || event.shiftKey ? "redo" : "undo";
};

// ── words ──────────────────────────────────────────────────────────────────────────────────────────

const KIND_WORDS: Record<string, string> = {
  entity: "Entity", target: "Target", entry: "Entry", spread: "Scene", order: "Scene order", groups: "Groups",
  environment: "Environment", passes: "Post-processing", appearance: "Appearance", book: "Experience", plugin: "Plugin", asset: "File",
};
/** A kind in words (the History's filter and its rows) */
export const kindWord = (kind: string): string => KIND_WORDS[kind] ?? kind;

/** The names the page knows: a scene's title, an entry's title, a target's entry */
export interface Names {
  scene?: (id: string) => string | undefined;
  entry?: (id: string) => string | undefined;
  target?: (id: string) => string | undefined;
}

/** What a change touched, in words: its kind and the name of its thing ("Entry Racoon", "Scene 12–13") */
export const changeTitle = (c: Pick<Change, "kind" | "ref">, names: Names = {}): string => {
  const word = kindWord(c.kind);
  const name = c.kind === "spread" ? names.scene?.(c.ref) : c.kind === "entry" ? names.entry?.(c.ref) : c.kind === "target" ? names.target?.(c.ref) : undefined;
  if (["order", "groups", "environment", "passes", "appearance", "book"].includes(c.kind)) return word;
  return `${word} ${name || c.ref}`;
};

const short = (value: unknown, max = 24): string => {
  if (value === undefined) return "–";
  const text = typeof value === "string" ? `"${value}"` : JSON.stringify(value) ?? "–";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The paths where two values differ (objects walked, a list or a value compared whole), at most `max` */
export const differences = (before: unknown, after: unknown, max = 3, path = ""): Array<{ path: string; before: unknown; after: unknown }> => {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!isObject(before) || !isObject(after)) return [{ path, before, after }];
  const found: Array<{ path: string; before: unknown; after: unknown }> = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])]) {
    if (found.length >= max) break;
    found.push(...differences(before[key], after[key], max - found.length, path ? `${path}.${key}` : key));
  }
  return found.slice(0, max);
};

/** The change's before → after in a line: "created", "removed", or the first fields that changed ("title: "A" → "B"") */
export const changeSummary = (c: Pick<Change, "kind" | "before" | "after">): string => {
  if (c.before === null || c.before === undefined) return "created";
  if (c.after === null || c.after === undefined) return "removed";
  if (c.kind === "order") return "scenes moved";
  if (c.kind === "plugin") return "source changed";
  const diff = differences(c.before, c.after);
  if (!diff.length) return "no difference";
  return diff.map(d => `${d.path ? `${d.path}: ` : ""}${short(d.before)} → ${short(d.after)}`).join(" · ");
};

/** Who saved it: "you", an e-mail's name, an AI connection's name */
export const whoWord = (c: Pick<Change, "user" | "token">, me: string | null): string => {
  const who = c.user === me && me ? "you" : c.user ? c.user.split("@")[0] : "someone";
  return c.token ? `${who} (${c.token})` : who;
};

/** When, short: the time today, else the day and the time */
export const whenWord = (iso: string, now = new Date()): string => {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? hm : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${hm}`;
};

// ── the History's filters ──────────────────────────────────────────────────────────────────────────

export interface HistoryFilter {
  scene: string | null;
  kind: string | null;
  person: string | null;
}

/** The scenes a change belongs to: a scene's own, an entry's or a target's scene, a shared entity's scenes; none for the book */
export type ScenesOf = (c: Pick<Change, "kind" | "ref">) => readonly string[];

/** The names and the scenes of changes from the book's tree (`GET /editor/books/{id}`, `scenes.tree`) */
export const treeNames = (tree: BookTree | null): { names: Names; scenesOf: ScenesOf } => {
  const entries = tree ? [...tree.spreads.flatMap(s => s.entries.map(e => ({ ...e, scene: s.id as string | null }))), ...tree.unassigned.map(e => ({ ...e, scene: null as string | null }))] : [];
  const scenesWhere = (match: (e: (typeof entries)[number]) => boolean): string[] => [...new Set(entries.filter(e => e.scene && match(e)).map(e => e.scene!))];
  return {
    names: {
      scene: id => { const s = tree?.spreads.find(x => x.id === id); return s ? s.title || s.label || s.id : undefined; },
      entry: id => entries.find(e => e.id === id)?.title,
      target: id => entries.find(e => e.target?.id === id)?.title,
    },
    scenesOf: c => {
      if (c.kind === "spread") return [c.ref];
      if (c.kind === "entry") return scenesWhere(e => e.id === c.ref);
      if (c.kind === "target") return scenesWhere(e => e.target?.id === c.ref);
      if (c.kind === "entity") return scenesWhere(e => (e.target?.entity as { ref?: string } | undefined)?.ref === c.ref);
      return [];
    },
  };
};

export const filterChanges =(changes: readonly Change[], filter: HistoryFilter, scenesOf: ScenesOf): Change[] =>
  changes.filter(c => (!filter.kind || c.kind === filter.kind) && (!filter.person || c.user === filter.person) && (!filter.scene || scenesOf(c).includes(filter.scene)));

/** The filters' choices from what the log holds: its kinds and its people */
export const filterChoices = (changes: readonly Change[]): { kinds: string[]; people: string[] } => ({
  kinds: [...new Set(changes.map(c => c.kind))].sort((a, b) => kindWord(a).localeCompare(kindWord(b))),
  people: [...new Set(changes.map(c => c.user).filter((u): u is string => !!u))].sort(),
});

// ── the prompt ─────────────────────────────────────────────────────────────────────────────────────

/** What a revert's prompt says, from its plan: the lines and the warnings */
export const promptLines = (result: RevertResult): { reverts: string; later: string | null; others: string | null; conflicts: string | null; skipped: string | null } => {
  const { counts, later, others } = result.plan;
  const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;
  return {
    reverts: counts.revert ? `${n(counts.revert, "change")} will be reverted – written back as new changes, so this can be reverted too.` : "Nothing can be reverted.",
    later: later ? `${n(later, "later edit")} to the same things will be lost (reverted with it).` : null,
    others: others.length ? `Changes by other people are among them: ${others.join(", ")}.` : null,
    conflicts: counts.conflict ? `${n(counts.conflict, "change")} cannot be reverted: changed since in a way the log does not hold – left as they are.` : null,
    skipped: counts.notRevertable ? `${n(counts.notRevertable, "change")} cannot be reverted at all (a creation, a removal, a move, a plugin source) – skipped.` : null,
  };
};
