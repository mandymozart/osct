import type { RenameIdsReport } from "./api.js";

/**
 * The admin page's rename of zero-padded ids (#63): Apply is offered only after a dry run that found ids to rename and
 * no collision – a refused experience would be left as it is, which the admin decides on first.
 */
export const canApply = (dryRun: RenameIdsReport | null): boolean =>
  !!dryRun && !dryRun.apply && dryRun.refused === 0 && dryRun.experiences.some(e => e.ids > 0);

/** The rows of a report in one line per experience: `osct: 412 ids – entries 300, scenes 112` */
export const reportLines = (report: RenameIdsReport): string[] =>
  report.experiences.map(e => {
    const rows = Object.entries(e.rows).map(([table, n]) => `${table} ${n}`).join(", ");
    return e.ids === 0 ? `${e.experience}: nothing to do` : `${e.experience}: ${e.ids} id${e.ids === 1 ? "" : "s"}${rows ? ` – ${rows}` : ""}${e.applied ? " (renamed)" : ""}`;
  });
