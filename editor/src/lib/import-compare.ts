import type { ImportComparison, ImportedBuild } from "./api";

/**
 * The import's version comparison (#183): before an import overwrites a book's draft, the page shows what comes in
 * against what the draft is based on and its edits since that import – the person confirms there, never in a browser
 * dialog. These are the comparison's words; ImportForm draws them.
 */

/** One row of the comparison: a property of the incoming build and of the draft's base */
export interface ComparisonRow {
  label: string;
  incoming: string;
  draft: string;
  differs: boolean;
}

const date = (iso: string | null | undefined): string => {
  if (!iso) return "–";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const value = (text: string | null | undefined): string => text || "–";

/** Build, date, app version and schema – incoming against the draft's base (`–` where it is not known) */
export const comparisonRows = (c: ImportComparison): ComparisonRow[] => {
  const base: Partial<ImportedBuild> = c.draft.basedOn ?? {};
  const row = (label: string, incoming: string, draft: string): ComparisonRow => ({ label, incoming, draft, differs: incoming !== draft });
  return [
    row("Build", value(c.incoming.build), value(base.build)),
    row("Built", date(c.incoming.date), date(base.date)),
    row("App version", value(c.incoming.appVersion), value(base.appVersion)),
    row("Schema", value(c.incoming.schema), value(base.schema)),
  ];
};

/** Who imported the draft's base and when: `imported 30 Oct 2026, 10:00 by author@example.com` */
export const importedLine = (c: ImportComparison): string => {
  const base = c.draft.basedOn;
  if (!base?.importedAt) return "The draft's import was not recorded.";
  return `Imported ${date(base.importedAt)}${base.importedBy ? ` by ${base.importedBy}` : ""}.`;
};

/** The draft's edits since its import – what the import replaces */
export const editsLine = (c: ImportComparison): string => {
  const n = c.draft.edits;
  const since = c.draft.basedOn?.importedAt ? "since the import" : "in the change log";
  if (n === 0) return `No edits ${since} – nothing of the draft's own is lost.`;
  return `${n} edit${n === 1 ? "" : "s"} ${since} – the import replaces ${n === 1 ? "it" : "them"}.`;
};

/** One edit in short: `entity castle · author@example.com · 30 Oct 2026, 10:00` */
export const editLabel = (edit: ImportComparison["draft"]["recentEdits"][number]): string =>
  [`${edit.kind} ${edit.ref}`, edit.token ? `${edit.user ?? "?"} (AI: ${edit.token})` : edit.user, date(edit.at)].filter(Boolean).join(" · ");

/** Where the draft as it is now is live – unpublished edits are lost for good */
export const liveLine = (c: ImportComparison): string => {
  const current = c.draft.live.filter(l => l.current).map(l => l.env);
  if (current.length) return `The draft as it is now (build ${c.draft.build}) is live on ${current.join(", ")}.`;
  const older = c.draft.live.map(l => l.env);
  return older.length
    ? `The draft as it is now (build ${c.draft.build}) is not published – ${older.join(", ")} serve${older.length === 1 ? "s" : ""} another build.`
    : `The draft as it is now (build ${c.draft.build}) is not published anywhere.`;
};

/** The primary button: what confirming does */
export const confirmLabel = (c: ImportComparison): string => (c.same && c.draft.edits === 0 ? "Import again" : "Replace the draft");
