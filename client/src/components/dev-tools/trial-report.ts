import type { Scene, Target } from "@/types";
import { entryPlaceLabel, sceneLabel, surfaceOf } from "@engine/content/scenes";
import type { TrialDevice } from "./trial-device";

/**
 * Trigger trial: which targets of the book were found during a test with the printed book (or the trigger
 * printout), and the Markdown report of the ones that were not. "Found" comes from the progress (the target was
 * unlocked while scanning) – nothing to mark by hand. Resetting the progress (debug overlay → progress) starts a
 * trial over.
 */

export type TrialResult = "found" | "untested";

/**
 * Where a target is printed, from the configuration (its `place`, schema 3.0 – carried in from the book layout by
 * `scripts/layout/place-targets.py`, #321): the surface it lies on, its size and box in mm from the surface's top left
 * corner, and the region of the surface that box lies in ("top left", "middle centre" …). Replaces the trigger
 * protocol file (#32).
 */
export interface PrintedPlace {
  /** The surface's label (`4–5`, `Cover`), else its id */
  surface: string;
  width: number;
  height?: number;
  x: number;
  y: number;
  /** The third of the surface the box's centre lies in: "top left", "middle centre", "bottom right" … */
  position: string;
}

const third = (at: number, size: number, words: readonly [string, string, string]): string =>
  words[size > 0 ? Math.min(2, Math.max(0, Math.floor((at / size) * 3))) : 1];

/** The target's printed place, or undefined when the configuration does not place it */
export function printedPlace(target: Pick<Target, "place">, scene: Pick<Scene, "surfaces">): PrintedPlace | undefined {
  const place = target.place;
  if (!place) return undefined;
  const surface = surfaceOf(scene, place.surface) ?? scene.surfaces[0];
  const height = place.height ?? place.width * 0.75;
  const row = surface ? third(place.y + height / 2, surface.heightMm, ["top", "middle", "bottom"]) : "middle";
  const column = surface ? third(place.x + place.width / 2, surface.widthMm, ["left", "centre", "right"]) : "centre";
  return {
    surface: surface?.label?.trim() || surface?.id || place.surface || "",
    width: place.width,
    ...(place.height !== undefined ? { height: place.height } : {}),
    x: place.x,
    y: place.y,
    position: `${row} ${column}`,
  };
}

export interface TrialRow {
  targetId: string;
  entryId: string;
  title: string;
  category: string;
  /** Where the entry is: its surface's or its scene's label (schema 3.0) */
  place: string;
  sceneId: string;
  /** The scene's label */
  sceneTitle: string;
  imageSrc: string;
  unlockedAt?: number;
  result: TrialResult;
  /** Where the target is printed (the configuration's `place`) – none when the target is not placed */
  printed?: PrintedPlace;
}

export interface TrialMeta {
  experienceTitle: string;
  appVersion: string;
  contentHash: string;
  /** The phone as the tester named it, with what the browser reports (trial-device.ts) */
  device: TrialDevice;
  /** The camera at download time (lens, resolution, focus, zoom – camera-debug.ts), optional */
  camera?: string;
  date: Date;
}

export const trialResult = (unlockedAt: number | undefined): TrialResult => (unlockedAt ? "found" : "untested");

/** One row per target, in scene and entry order */
export function trialRows(scenes: Scene[], unlocked: Record<string, number>): TrialRow[] {
  return scenes.flatMap(scene =>
    scene.targets.map(target => {
      const entry = scene.entries.find(e => e.id === target.entryId);
      const printed = printedPlace(target, scene);
      return {
        targetId: target.id,
        entryId: target.entryId,
        title: entry?.title ?? target.entryId,
        category: entry?.category ?? "",
        place: entry ? entryPlaceLabel(entry, scene) : sceneLabel(scene),
        sceneId: scene.id,
        sceneTitle: sceneLabel(scene),
        imageSrc: target.imageSrc,
        unlockedAt: unlocked[target.id],
        result: trialResult(unlocked[target.id]),
        ...(printed ? { printed } : {}),
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
const mm = (value: number) => String(Math.round(value * 10) / 10);
const fileName = (src: string) => src.replace(/[?#].*$/, "").replace(/^.*\//, "");

/** The report's printed-image cell: the image file, then the surface, the size, the region and the box's corner */
export const printedLine = (row: Pick<TrialRow, "imageSrc" | "printed">): string => {
  const place = row.printed;
  if (!place) return [fileName(row.imageSrc), "not placed"].filter(Boolean).join(" · ");
  return [
    fileName(row.imageSrc),
    place.surface,
    place.height !== undefined ? `${mm(place.width)} × ${mm(place.height)} mm` : `${mm(place.width)} mm wide`,
    `${place.position} (x ${mm(place.x)}, y ${mm(place.y)} mm)`,
  ].filter(Boolean).join(" · ");
};

/** The header's device lines: the model as entered and where its prefill came from, screen, OS, language, tester */
export const deviceLines = (device: TrialDevice): string[] => [
  `- Device: ${device.model.trim() || "–"} (tester) · ${device.source}`,
  `- Screen: ${device.screen}`,
  `- OS: ${device.os}`,
  `- Language: ${device.language || "–"}`,
  ...(device.tester?.trim() ? [`- Tester: ${device.tester.trim()}`] : []),
  `- User agent: ${device.userAgent}`,
];

/** The report for the designers: the targets not found (with where they are printed), then a short list of the found */
export function trialReport(rows: TrialRow[], meta: TrialMeta): string {
  const counts = countResults(rows);
  const notFound = rows.filter(r => r.result === "untested");
  const found = rows.filter(r => r.result === "found");
  const date = meta.date.toISOString().slice(0, 16).replace("T", " ");
  return [
    `# Trigger test – ${meta.experienceTitle}`,
    "",
    `- Date: ${date} (UTC)`,
    `- App ${meta.appVersion} · content ${meta.contentHash.slice(0, 12)}`,
    ...deviceLines(meta.device),
    ...(meta.camera ? [`- Camera: ${meta.camera}`] : []),
    `- Targets: ${rows.length} · found ${counts.found} · not found ${counts.untested}`,
    "",
    `## Not found (${notFound.length})`,
    "",
    ...(notFound.length
      ? [
        "| Place | Target | Entry | Printed image |",
        "|---|---|---|---|",
        ...notFound.map(r => `| ${cell(r.place)} | ${cell(r.targetId)} | ${cell(`${r.title} (${r.category})`)} | ${cell(printedLine(r) || "–")} |`),
      ]
      : ["None."]),
    "",
    `## Found (${found.length})`,
    "",
    found.length ? found.map(r => `${r.targetId} (${time(r.unlockedAt)})`).join(", ") : "None.",
    "",
  ].join("\n");
}
