/**
 * Scenes (#307, `agents/SCENES.md` phase 1, schema 2.35): which spread an entry belongs to and the labels the reader
 * shows for a place in the book. Pure, for the tests – `./game-config.ts` applies them to the loaded configuration.
 *
 * - An entry's spread is its `scene` when set, else the spread whose page range holds its `page` (content before 2.35).
 * - A label is what is printed (free text, never arithmetic): an entry's surface label, else today's page label – its
 *   page number, or its spread's title on a cover and on front or back matter, which have no printed number.
 */
import { matterOf, type EntryData, type SpreadData, type SurfaceData } from "@shared/types/game-config";

type SpreadPages = Pick<SpreadData, "id" | "firstPage" | "lastPage">;

/** The id of an entry's spread: its `scene` when that names a spread, else the first spread whose pages hold its page */
export const sceneIdOf = (entry: Pick<EntryData, "page" | "scene">, spreads: readonly SpreadPages[]): string | undefined => {
  if (entry.scene !== undefined && spreads.some(s => s.id === entry.scene)) return entry.scene;
  return spreads.find(s => entry.page >= s.firstPage && entry.page <= s.lastPage)?.id;
};

/** The surface of a scene with the given id, if the scene has it */
export const surfaceOf = (spread: Pick<SpreadData, "surfaces"> | undefined, surfaceId: string | undefined): SurfaceData | undefined =>
  surfaceId === undefined ? undefined : spread?.surfaces?.find(s => s.id === surfaceId);

const labelOf = (value: string | undefined): string | null => {
  const label = value?.trim();
  return label ? label : null;
};

/** A spread without printed numbers: the covers and the front and back matter (shown by their title) */
const isUnnumbered = (spread: Pick<SpreadData, "format" | "matter">): boolean =>
  spread.format === "cover" || spread.format === "back" || !!matterOf(spread);

/**
 * The place an entry is on, as the reader finds it in the book: its surface's label as printed (schema 2.35); else its
 * page number, or – on a cover and the front and back matter, which have none – its spread's title
 */
export const entryPlaceLabel = (
  entry: Pick<EntryData, "page" | "surface">,
  spread: Pick<SpreadData, "title" | "format" | "matter" | "surfaces"> | undefined,
): string =>
  labelOf(surfaceOf(spread, entry.surface)?.label) ??
  (spread && isUnnumbered(spread) ? spread.title : String(entry.page));

/** The first and the last label of a scene's surfaces (the same for one), or null when no surface carries one */
export const surfaceLabelRange = (spread: Pick<SpreadData, "surfaces">): { first: string; last: string } | null => {
  const labels = (spread.surfaces ?? []).flatMap(s => labelOf(s.label) ?? []);
  return labels.length ? { first: labels[0], last: labels[labels.length - 1] } : null;
};

/**
 * The label a scene carries (schema 2.35): its own `label`, else its surfaces' labels (`40–41`, `ii`), else null –
 * then the reader shows what it showed before (page numbers or the title)
 */
export const sceneLabel = (spread: Pick<SpreadData, "label" | "surfaces">): string | null => {
  const own = labelOf(spread.label);
  if (own) return own;
  const range = surfaceLabelRange(spread);
  return range && (range.first === range.last ? range.first : `${range.first}–${range.last}`);
};
