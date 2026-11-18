import { type AppearanceData, type BookAppearance, DEFAULT_APPEARANCE_TYPE, type Moment, MOMENTS, type PassData } from "@engine/types";
import { passSummary } from "./passes-edit";
import { setPassValue, type RowValue, type ValueRow } from "./values";

/**
 * The appearance panel's model (#265): the book's looks by moment – `reveal` (the first find), `found` (every later
 * find), `lost` (the page is lost). A moment without a look of its own plays `found`'s, and without that the default
 * (`momentAppearance`, shared/types/appearance.ts). The panel edits a copy of the book's `appearance` and saves it whole
 * (`PUT …/appearance`); a book whose copy names no moment saves `null` – it holds no field then. Pure, for the tests.
 */

/** Where a moment's look comes from: its own, `found`'s, or the default */
export type LookSource = "own" | "found" | "default";

/** A copy in the moments' order, each look copied (the panel never edits the loaded content) */
export const draftAppearance = (appearance: BookAppearance | null | undefined): BookAppearance => {
  const draft: BookAppearance = {};
  for (const moment of MOMENTS) {
    const look = appearance?.[moment];
    if (look) draft[moment] = { ...look };
  }
  return draft;
};

/** The two say the same (moments in any order) */
export const sameAppearance = (a: BookAppearance | null | undefined, b: BookAppearance | null | undefined): boolean =>
  JSON.stringify(draftAppearance(a)) === JSON.stringify(draftAppearance(b));

/** What a save writes: the moments with a look, in their order – `null` when none has one (the book holds no field) */
export const appearanceToSave = (draft: BookAppearance): BookAppearance | null => {
  const saved = draftAppearance(draft);
  return Object.keys(saved).length ? saved : null;
};

/** Where the moment's look comes from */
export const lookSource = (draft: BookAppearance, moment: Moment): LookSource =>
  draft[moment] ? "own" : moment !== "found" && draft.found ? "found" : "default";

/** The type of the look the moment plays (its own, `found`'s, the default) */
export const playedType = (draft: BookAppearance, moment: Moment): string =>
  draft[moment]?.type ?? draft.found?.type ?? DEFAULT_APPEARANCE_TYPE;

/**
 * The look the moment plays, with its values: its own, else `found`'s (a moment other than `found`), else the default look
 * at its defaults – what the panel shows rows for, so the values of a look can be read and changed before any look was picked
 */
export const playedLook = (draft: BookAppearance, moment: Moment): AppearanceData =>
  draft[moment] ?? (moment !== "found" ? draft.found : undefined) ?? { type: DEFAULT_APPEARANCE_TYPE };

/**
 * The moment with a look of its own: the one it has, else a copy of the look it plays (`found`'s or the default) – so the
 * first change to an inherited moment starts from what played, not from nothing
 */
export const ownLook = (draft: BookAppearance, moment: Moment): BookAppearance =>
  draft[moment] ? draft : { ...draftAppearance(draft), [moment]: { ...playedLook(draft, moment) } };

/**
 * The moment with a look of `type` – or, `null`, without one of its own. The same type keeps its values; another type
 * starts with its defaults (`{ type }`)
 */
export const setLook = (draft: BookAppearance, moment: Moment, type: string | null): BookAppearance => {
  const next = draftAppearance(draft);
  if (type === null) delete next[moment];
  else next[moment] = next[moment]?.type === type ? next[moment] : { type };
  return draftAppearance(next);
};

/**
 * The moment's look with one value changed (a row's); a value equal to the default is dropped from the data. A moment
 * that plays another's look takes a copy of it first (`ownLook`)
 */
export const setLookValue = (draft: BookAppearance, moment: Moment, row: ValueRow, value: RowValue): BookAppearance => {
  const owned = ownLook(draft, moment);
  const look = owned[moment]!;
  return draftAppearance({ ...owned, [moment]: setPassValue(look as PassData, row, value) as AppearanceData });
};

/** The words of the picker's empty choice: the moment plays another's look */
export const inheritLabel = (moment: Moment): string => (moment === "found" ? `default (${DEFAULT_APPEARANCE_TYPE})` : "as found");

/**
 * The line a closed moment shows after its name: its look and up to two values set away from the default
 * ("printLift · appear 900 ms"); a moment without a look of its own names where its look comes from
 * ("as found · printLift", "default · inflateDissolve")
 */
export const momentSummary = (draft: BookAppearance, moment: Moment, rows: readonly ValueRow[]): string => {
  const look = draft[moment];
  if (!look) return `${lookSource(draft, moment) === "found" ? "as found" : "default"} · ${playedType(draft, moment)}`;
  const values = passSummary(look as PassData, rows);
  // passSummary names the first parameter when none is set – a look at its defaults says only its type
  const changed = rows.some(row => look[row.id.split(".")[2]] !== undefined);
  return changed && values ? `${look.type} · ${values}` : look.type;
};

/** The section's head: the book's level, "· default" while it names no look */
export const appearanceHeading = (draft: BookAppearance): string =>
  `appearance${Object.keys(draft).length ? "" : " · default"}`;
