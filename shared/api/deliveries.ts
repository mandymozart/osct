/**
 * A publisher's delivery through the API (#322, server/api/src/Deliveries.php, docs/server.md "Deliveries"):
 * `POST /editor/experiences/{id}/deliveries` takes a plan – the scenes its entries need, the entries with their targets and
 * the Library files they name – and answers the comparison with the draft; with `apply: true` it writes it in one
 * transaction. The files are uploaded before (`POST …/assets`, the CLI converts them); the plan names them by the asset's
 * id or URL. Not content: `shared/api/` is outside the content schema lock (RULES #10).
 */
import type { SurfaceData } from "../types/game-config";
import type { EntryCategory } from "../types/entry";
import type { ScenePreset } from "./editor";

/** A scene the delivery's entries need: kept when it exists, else made with a preset's surfaces (default double) or its own */
export interface DeliveryScene {
  id: string;
  /** Default: the id */
  label?: string;
  preset?: ScenePreset;
  /** Instead of `preset` – a surface without `place` lies in a row */
  surfaces?: SurfaceData[];
}

/** An entry's target in a delivery: its printed image and the video on it, Library files by id or URL */
export interface DeliveryTarget {
  imageSrc: string;
  /** `false` switches a new target off; an existing target keeps its switch */
  enabled?: boolean;
  video?: string;
}

/**
 * An entry of a delivery. A new entry gets these texts; an existing one keeps its texts, category and scene – only its
 * `image` and its target's image and video follow the delivery.
 */
export interface DeliveryEntry {
  id: string;
  /** A scene of the experience or of the plan's `scenes` */
  scene: string;
  surface?: string;
  /** One of ENTRY_CATEGORIES, as text */
  category: `${EntryCategory}`;
  title: string;
  author?: string;
  body?: string;
  caption?: string;
  media?: string;
  tags?: string[];
  /** The entry's picture – a Library file by id or URL */
  image?: string;
  target?: DeliveryTarget;
}

/** The body of `POST /editor/experiences/{id}/deliveries` */
export interface DeliveryPlan {
  /** The delivery's name (e.g. its folder's) */
  name: string;
  /** Where it came from – information for the record */
  source?: string;
  /** In the book's order: a new scene goes after the plan's scene before it */
  scenes?: DeliveryScene[];
  entries: DeliveryEntry[];
  /** Write it (default: compare only) */
  apply?: boolean;
  /** Write the conflicts too (default: they are left as they are) */
  overwrite?: boolean;
}

/**
 * What the delivery does to one row: `new` – made; `changed` – its `fields` follow the delivery; `same` – nothing to do;
 * `conflict` – the fields were edited in the editor since the last delivery (or the target shows another entity): left as
 * it is unless `overwrite`
 */
export type DeliveryStatus = "new" | "changed" | "same" | "conflict";

/** One row of the comparison */
export interface DeliveryItem {
  kind: "scene" | "entry" | "target";
  id: string;
  status: DeliveryStatus;
  /** What the delivery changes: `image` (an entry), `imageSrc`, `video` (a target) */
  fields?: string[];
  /** Why it is a conflict */
  reason?: string;
  /** An entry's scene */
  scene?: string;
  /** A target's entry */
  entry?: string;
}

/**
 * The answer: without `apply` the comparison (`applied` false, `delivery.id` null, nothing written); with it the same after
 * writing – `written` the changes' ids (each names the delivery: `Change.delivery`), revertable with `…/changes/revert`.
 * A 409 `delivery-problems` carries the comparison in `details.comparison` when `apply` met a problem.
 */
export interface DeliveryResult {
  delivery: { id: string | null; name: string; source: string | null };
  applied: boolean;
  items: DeliveryItem[];
  counts: Record<DeliveryStatus, number>;
  /** What stops the delivery: an unknown scene or file, a target id in use, too many targets on a scene */
  problems: string[];
  /** What it leaves as it is: an entry on another scene, a target the delivery switches off */
  warnings: string[];
  written: string[];
}
