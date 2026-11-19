import { confirmationStep } from "@shared/api/errors";
import type { Confirmation, RemovalImpact } from "./api";
import { count } from "./import-preview";

/**
 * Removing a scene or an entry with everything on it (#198, docs/server.md "Removing a scene or an entry"): the API
 * answers the first DELETE with the impact and a confirmation id, the person confirms in the page (never a browser
 * dialog), the same DELETE with the id removes exactly that. These are the confirmation's words and its step;
 * RemovalConfirm draws them.
 */

/** The step to confirm: what the removal takes, the id to send back, and whether an earlier id was void */
export interface RemovalStep {
  impact: RemovalImpact;
  confirmation: Confirmation;
  /** The experience changed since the impact the person saw (409 confirmation-void): this is the fresh one */
  changed: boolean;
}

/** A 409 confirm-delete / confirmation-void as the step to confirm; anything else: null */
export const removalStep = (error: unknown): RemovalStep | null => {
  const step = confirmationStep<RemovalImpact>(error, "removal");
  return step && { impact: step.shows, confirmation: step.confirmation, changed: step.changed };
};

/** "3 entries, 3 targets, 2 entities" – the parts that are not zero */
const takes = (impact: RemovalImpact, withEntries: boolean): string =>
  [
    withEntries && impact.counts.entries ? count(impact.counts.entries, "entry", "entries") : "",
    impact.counts.targets ? count(impact.counts.targets, "target", "targets") : "",
    impact.counts.entities ? count(impact.counts.entities, "entity", "entities") : "",
  ].filter(Boolean).join(", ");

/** What is removed: "scene “4–5”", "entry “Castle”" */
export const removedName = (impact: RemovalImpact): string =>
  impact.kind === "entry" ? `entry “${impact.entry.title}”` : `scene “${impact.scene.label || impact.scene.id}”`;

/** The confirmation's first line: "Removes scene “4–5” with 3 entries, 3 targets, 2 entities." */
export const removalHeadline = (impact: RemovalImpact): string => {
  const what = takes(impact, impact.kind === "scene");
  return `Removes ${removedName(impact)}${what ? ` with ${what}` : ""}.`;
};

/** The shared entities that stay because other targets use them, or null: "Kept: entity castle (also on castle-target)." */
export const keptEntitiesLine = (impact: RemovalImpact): string | null => {
  if (!impact.keptEntities.length) return null;
  const items = impact.keptEntities.map(e => `entity ${e.ref} (also on ${e.usedBy.join(", ")})`);
  return `Kept: ${items.join("; ")}.`;
};

/** What happens to the Library files with the option as it is */
export const filesLine = (impact: RemovalImpact, deleteFiles: boolean): string => {
  const only = impact.files.onlyHere.length;
  if (!deleteFiles || !only) return "Library files are kept.";
  return `${count(only, "Library file", "Library files")} used only here ${only === 1 ? "is" : "are"} deleted${impact.files.elsewhere.length ? ", the others are kept" : ""}.`;
};

/** The option's label, or null when no file is used only here: "Also delete the 2 files used only here" */
export const deleteFilesLabel = (impact: RemovalImpact): string | null => {
  const only = impact.files.onlyHere.length;
  if (!only) return null;
  return only === 1 ? "Also delete the file used only here" : `Also delete the ${only} files used only here`;
};

/** The files the option deletes, by name */
export const onlyHereNames = (impact: RemovalImpact): string => impact.files.onlyHere.map(f => f.name).join(", ");

/** The files used elsewhere – always kept – or null: "Kept, used elsewhere: shared.png" */
export const elsewhereLine = (impact: RemovalImpact): string | null =>
  impact.files.elsewhere.length ? `Kept, used elsewhere: ${impact.files.elsewhere.map(f => f.name).join(", ")}.` : null;

/** The confirm button's words */
export const removeLabel = (impact: RemovalImpact): string => (impact.kind === "entry" ? "Remove the entry" : `Remove ${removedName(impact)}`);
