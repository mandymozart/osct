import type { EntityData } from "@engine/types";

/**
 * What the stage and the panels share (#340: the stage runs in the editor's page – these were the stage frame's messages
 * of #234 once, now plain types).
 */

/**
 * The override that stands for "the entity is removed" (the root went): the stage shows nothing, the Inspector shows no
 * node, the draft gets no entity. Compared by reference.
 */
export const REMOVED_ENTITY: EntityData = Object.freeze({ type: "group", assets: [] }) as EntityData;

/** One surface of the open scene as the stage has it (#314); `flat` = on the table plane (a wall or a turned surface is not) */
export interface SurfaceSnapshot {
  id: string;
  widthMm: number;
  heightMm: number;
  flat: boolean;
}

/** A tap on the stage hit this surface (#314: the Surface mode), mm from its top left corner – null: none */
export type SurfacePick = { surfaceId: string; x: number; y: number } | null;

/** A line of the experience's code for the Code tab and the Log tab: a plugin's `api.log`, a plugin's error on the stage */
export interface StageLog {
  level: "info" | "warn" | "error";
  text: string;
  /** The page's clock when it was said (`performance.now()`), as a stage event's `t` */
  t?: number;
  /** Milliseconds since the scene on the stage opened, as a stage event's `at` */
  at?: number;
}

/** How long a log line may be (a plugin logging a whole buffer is cut) */
export const LOG_MAX = 2000;

/** The result of running transpiled plugin code on the stage */
export type RunResult = { ok: true; types: string[] } | { ok: false; error: string };

/** How a run that did not finish in time begins (`Stage.runPlugin` with a timeout, #269) */
export const NO_ANSWER = "the stage did not answer";
