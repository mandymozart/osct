import type { Spread } from "@/types";

/**
 * Trigger trial: which targets of the book were found during a test with the printed book (or the trigger
 * printout), and the Markdown report of the ones that were not. "Found" comes from the progress (the target was
 * unlocked while scanning) – nothing to mark by hand. Resetting the progress (debug overlay → progress) starts a
 * trial over.
 */

export type TrialResult = "found" | "untested";

/** What the content build knows about a target's printed image (`/trigger-protocol.json`, optional) */
import type { TriggerInfo, TriggerInfos } from "@/components/ar-bridges";
export type { TriggerInfo, TriggerInfos };

export interface TrialRow {
  targetId: string;
  entryId: string;
  title: string;
  category: string;
  page: number;
  spreadId: string;
  spreadTitle: string;
  imageSrc: string;
  unlockedAt?: number;
  result: TrialResult;
  info?: TriggerInfo;
}

export interface TrialMeta {
  bookTitle: string;
  appVersion: string;
  contentHash: string;
  device: string;
  /** The camera at download time (lens, resolution, focus, zoom – camera-debug.ts), optional */
  camera?: string;
  date: Date;
}

export const trialResult = (unlockedAt: number | undefined): TrialResult => (unlockedAt ? "found" : "untested");

/** One row per target, in spread and entry order */
export function trialRows(spreads: Spread[], unlocked: Record<string, number>, infos: TriggerInfos = {}): TrialRow[] {
  return spreads.flatMap(spread =>
    spread.targets.map(target => {
      const entry = spread.entries.find(e => e.id === target.entryId);
      return {
        targetId: target.id,
        entryId: target.entryId,
        title: entry?.title ?? target.entryId,
        category: entry?.category ?? "",
        page: entry?.page ?? spread.firstPage,
        spreadId: spread.id,
        spreadTitle: spread.title,
        imageSrc: target.imageSrc,
        unlockedAt: unlocked[target.id],
        result: trialResult(unlocked[target.id]),
        info: infos[target.id],
      };
    }),
  );
}

export const countResults = (rows: TrialRow[]): Record<TrialResult, number> => {
  const counts: Record<TrialResult, number> = { found: 0, untested: 0 };
  rows.forEach(row => counts[row.result]++);
  return counts;
};

const time = (ms?: number) => (ms ? new Date(ms).toISOString().slice(11, 16) : "");
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const printed = (info?: TriggerInfo) =>
  [info?.source, info?.width && info.height ? `${info.width} × ${info.height} mm` : "", info?.position].filter(Boolean).join(" · ");

/** The report for the designers: the targets not found (with their printed image), then a short list of the found */
export function trialReport(rows: TrialRow[], meta: TrialMeta): string {
  const counts = countResults(rows);
  const notFound = rows.filter(r => r.result === "untested");
  const found = rows.filter(r => r.result === "found");
  const date = meta.date.toISOString().slice(0, 16).replace("T", " ");
  return [
    `# Trigger test – ${meta.bookTitle}`,
    "",
    `- Date: ${date} (UTC)`,
    `- App ${meta.appVersion} · content ${meta.contentHash.slice(0, 12)}`,
    `- Device: ${meta.device}`,
    ...(meta.camera ? [`- Camera: ${meta.camera}`] : []),
    `- Targets: ${rows.length} · found ${counts.found} · not found ${counts.untested}`,
    "",
    `## Not found (${notFound.length})`,
    "",
    ...(notFound.length
      ? [
        "| Page | Target | Entry | Printed image | Note |",
        "|---|---|---|---|---|",
        ...notFound.map(r => `| ${r.page} | ${cell(r.targetId)} | ${cell(`${r.title} (${r.category})`)} | ${cell(printed(r.info) || "–")} | ${cell(r.info?.note ?? "")} |`),
      ]
      : ["None."]),
    "",
    `## Found (${found.length})`,
    "",
    found.length ? found.map(r => `${r.targetId} (${time(r.unlockedAt)})`).join(", ") : "None.",
    "",
  ].join("\n");
}
