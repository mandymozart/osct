/**
 * The **Log** tab's one timeline (three-free): the stage's events, the rules' lines (behaviour, goto) and the plugins'
 * lines from the stage, merged newest first by the frame's clock; and the **problems** – the Logic issues and the plugins
 * that are not on the stage – a current state, not timed, pinned above. Filter chips show only the kinds picked; the
 * choice is kept per browser.
 */
import type { StageEvent } from "./event-log";
import type { FrameLog } from "./frame-protocol";
import { readStoredJson, writeStoredJson } from "../storage";

/** What a line is: a stage event, a rule's line, a plugin's line, a problem by its severity */
export type LogKind = "event" | "behaviour" | "plugin" | "error" | "warning";

/** The chips in their order, with their words */
export const LOG_KINDS: readonly LogKind[] = ["event", "behaviour", "plugin", "error", "warning"];
export const LOG_KIND_LABELS: Readonly<Record<LogKind, string>> = {
  event: "events",
  behaviour: "behaviour",
  plugin: "plugin log",
  error: "errors",
  warning: "warnings",
};

/** A timed line of the timeline */
export interface LogEntry {
  kind: Exclude<LogKind, "error" | "warning">;
  /** Milliseconds since the scene on the stage opened, null when unknown */
  at: number | null;
  /** The event's name (`found`, `behaviour`, `goto`) or the plugin line's level (`info`, `warn`, `error`) */
  line: string;
  /** The payload or the plugin's text */
  detail: string;
  /** A plugin's error line */
  failed: boolean;
}

/** A problem, pinned above the timeline: where it is and what it says, and where a click goes */
export interface LogProblem<Go = unknown> {
  kind: "error" | "warning";
  place: string;
  text: string;
  /** The whole sentence (the row's title) */
  message: string;
  /** What a click opens, null for nothing */
  go: Go | null;
}

/** Events that are the log's own lines about the rules, not events of the stage */
const BEHAVIOUR_LINES = new Set(["behaviour", "goto"]);

/** A stage event as a line of the timeline */
export const eventEntry = (e: StageEvent): LogEntry => ({
  kind: BEHAVIOUR_LINES.has(e.event) ? "behaviour" : "event",
  at: e.at,
  line: e.event,
  detail: e.detail,
  failed: false,
});

/** A plugin's line as a line of the timeline */
export const pluginEntry = (log: FrameLog): LogEntry => ({
  kind: "plugin",
  at: log.at ?? null,
  line: log.level,
  detail: log.text,
  failed: log.level === "error",
});

/**
 * The events (newest first, as the stage keeps them) and the plugins' lines (newest last, as they came) as one timeline,
 * newest first: merged by the frame's clock (`t`); a line without one sorts as the oldest of its list
 */
export const mergeLog = (events: readonly StageEvent[], logs: readonly FrameLog[]): LogEntry[] => {
  const a = events.map(e => ({ t: e.t ?? -Infinity, entry: eventEntry(e) }));
  const b = [...logs].reverse().map(l => ({ t: l.t ?? -Infinity, entry: pluginEntry(l) }));
  const merged: LogEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i].t >= b[j].t)) merged.push(a[i++].entry);
    else merged.push(b[j++].entry);
  }
  return merged;
};

/** The lines and problems the chips show */
export const filterLog = <T extends { kind: LogKind }>(entries: readonly T[], shown: ReadonlySet<LogKind>): T[] =>
  entries.filter(e => shown.has(e.kind));

/** A chip toggled */
export const toggleLogKind = (shown: ReadonlySet<LogKind>, kind: LogKind): Set<LogKind> => {
  const next = new Set(shown);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  return next;
};

/** How many lines of each kind there are – the chips show it */
export const countKinds = (entries: readonly { kind: LogKind }[]): Record<LogKind, number> => {
  const counts: Record<LogKind, number> = { event: 0, behaviour: 0, plugin: 0, error: 0, warning: 0 };
  for (const e of entries) counts[e.kind]++;
  return counts;
};

/**
 * The scene Inspector's one line about the narrative: "3 vars · 12 events" (the timeline's lines, the rules' and the
 * plugins' included), "no vars · no events"
 */
export const narrativeSummary = (vars: number, events: number): string => {
  const n = (k: number, word: string) => (k ? `${k} ${word}${k === 1 ? "" : "s"}` : `no ${word}s`);
  return `${n(vars, "var")} · ${n(events, "event")}`;
};

const FILTER_KEY = "osct-editor-log-filter";

/** The chips as kept in this browser: every kind when nothing (or nothing valid) is stored */
export const readLogFilter = (): Set<LogKind> => {
  const stored = readStoredJson(FILTER_KEY);
  if (!Array.isArray(stored)) return new Set(LOG_KINDS);
  return new Set(stored.filter((k): k is LogKind => (LOG_KINDS as readonly unknown[]).includes(k)));
};

export const writeLogFilter = (shown: ReadonlySet<LogKind>): void => writeStoredJson(FILTER_KEY, LOG_KINDS.filter(k => shown.has(k)));

/**
 * The problems' block closed to its head: the counts by severity and the first problem, as the Logic issues bar's line
 * ("2 errors · 1 warning – doorOpened is emitted …"), "none" without any
 */
export const problemsSummary = (problems: readonly { kind: "error" | "warning"; place: string; text: string }[]): string => {
  if (!problems.length) return "none";
  const errors = problems.filter(p => p.kind === "error").length;
  const warnings = problems.length - errors;
  const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;
  const counts = [errors ? n(errors, "error") : "", warnings ? n(warnings, "warning") : ""].filter(Boolean).join(" · ");
  const first = problems.find(p => p.kind === "error") ?? problems[0];
  return `${counts} – ${first.place ? `${first.place} ` : ""}${first.text}`;
};

/** A list closed to its head: how many, and the first names ("3 · doorOpen, hasKey, tries", "2 · a, b, …"), "none" */
export const listSummary = (names: readonly string[], shown = 3): string =>
  names.length ? `${names.length} · ${names.slice(0, shown).join(", ")}${names.length > shown ? ", …" : ""}` : "none";
