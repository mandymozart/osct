import { type LoadTestOptions, type LoadTestResult, median } from "@engine/utils/tracker-debug";

export interface LoadTestMeta {
  experienceTitle: string;
  appVersion: string;
  contentHash: string;
  device: string;
  /** The recognition path the run used (#306): `recognitionLabel()` – the mode and whether this device overrides the experience */
  recognition: string;
  date: Date;
  sceneId: string;
  sceneTargets: number;
  options: Pick<LoadTestOptions, "steadyMs" | "covers">;
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);
const fixed = (value: number, digits = 0) => value.toFixed(digits);

/** Re-find times of a step: "median / max" ms, or "–" without covers */
export const findLabel = (result: Pick<LoadTestResult, "findMs">): string =>
  result.findMs.length ? `${fixed(median(result.findMs))} / ${fixed(Math.max(...result.findMs))}` : "–";

/** One results row as table cells (the panel and the report use the same values) */
export const loadTestCells = (result: LoadTestResult): string[] => [
  `${result.loaded} (+${result.extra})`,
  String(result.scenes),
  result.sceneId,
  seconds(result.prepareMs),
  seconds(result.extractMs),
  fixed(result.engineFps, 1),
  fixed(result.pageFps, 1),
  String(result.longFrames),
  `${fixed(result.foundShare * 100)} %`,
  String(result.lost),
  findLabel(result),
  String(result.misses),
  result.heapMb === null ? "–" : fixed(result.heapMb),
];

export const LOAD_TEST_COLUMNS = [
  "Targets held", "Scenes", "Scanned", "Prepare s", "Extract s", "Engine fps", "Page fps", "Stutter frames",
  "Found", "Lost", "Re-find ms (median / max)", "Misses", "Heap MB",
];

/** Markdown report of a load test, to compare devices and decide how many targets to keep loaded */
export const loadTestReport = (results: readonly LoadTestResult[], meta: LoadTestMeta): string => {
  const date = meta.date.toISOString().slice(0, 16).replace("T", " ");
  const lines = [
    `# Engine load test – ${meta.experienceTitle}`,
    "",
    `- Date: ${date} (UTC)`,
    `- App ${meta.appVersion} · content ${meta.contentHash.slice(0, 12)}`,
    `- Device: ${meta.device}`,
    `- Recognition: ${meta.recognition}`,
    `- Started on ${meta.sceneId} · ${seconds(meta.options.steadyMs)} s measured per step · ${meta.options.covers} lens covers per step`,
    "",
    `| ${LOAD_TEST_COLUMNS.join(" | ")} |`,
    `|${LOAD_TEST_COLUMNS.map(() => "---").join("|")}|`,
    ...results.map(result => `| ${loadTestCells(result).join(" | ")} |`),
    "",
    "Per step the window next to the scanned scene gets a target budget (+extra, nearest scenes first); the",
    "tracker holds it and the preloader fetches its content while the app runs as usual (pages switch).",
    "- Targets held / Scenes: what the engine held at the end of the step; Scanned: the scene being scanned.",
    "- Prepare: the app turning the window's new target images into image targets; Extract: the engine extracting",
    "  their features (both on the main thread).",
    "- Engine fps: camera frames the engine processed; Page fps / Stutter: page frames, and frames over 50 ms.",
    "- Found: share of engine frames with the scanned page's target found; Lost: times it was lost.",
    "- Re-find: lens uncovered → target found again; Misses: not found within 10 s.",
    "",
  ];
  return lines.join("\n");
};
