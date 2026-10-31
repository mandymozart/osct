import type { BookData, StepAction, StepData } from "@shared/types/game-config";
import { STEP_ACTIONS } from "@shared/types/game-config";
import { BODY_MAX_LENGTH, STEP_TIME_MAX, STEPS_MAX, TEXT_MAX_LENGTH } from "@shared/api/rules";

/**
 * The book's texts on the book page (#223): its title, author and publisher (`PUT /editor/books/{id}`), and the
 * onboarding's steps as an ordered list (`PUT …/tutorial`) – each step's texts, illustration, button and its action,
 * and the timing. Pure: the page (`BookTexts.svelte`, `OnboardingSteps.svelte`) holds the drafts and draws them.
 */

// ── The book ──

export interface BookDraft {
  title: string;
  author: string;
  publisher: string;
}

export const bookDraftOf = (book: Pick<BookData, "title" | "author" | "publisher">): BookDraft => ({
  title: book.title,
  author: book.author,
  publisher: book.publisher ?? "",
});

/** A save's body: the fields that differ; an emptied publisher is `null` (removed) */
export const bookChanges = (book: Pick<BookData, "title" | "author" | "publisher">, draft: BookDraft): Record<string, string | null> => {
  const changes: Record<string, string | null> = {};
  if (draft.title.trim() !== book.title) changes.title = draft.title.trim();
  if (draft.author.trim() !== book.author) changes.author = draft.author.trim();
  if (draft.publisher.trim() !== (book.publisher ?? "")) changes.publisher = draft.publisher.trim() || null;
  return changes;
};

export const bookProblems = (draft: BookDraft): string[] => [
  ...(!draft.title.trim() ? ["The title is empty."] : []),
  ...(!draft.author.trim() ? ["The author is empty."] : []),
  ...(Object.entries(draft).some(([, value]) => value.trim().length > TEXT_MAX_LENGTH) ? [`A text is longer than ${TEXT_MAX_LENGTH} characters.`] : []),
];

// ── The onboarding ──

/** The timing fields of a step, in milliseconds (none = the app's default) */
export const STEP_TIMES = ["fadeIn", "stagger", "advance"] as const;
export type StepTime = (typeof STEP_TIMES)[number];

/** The text fields of a step */
export const STEP_TEXTS = ["title", "description", "footer", "illustration", "button"] as const;
export type StepText = (typeof STEP_TEXTS)[number];

/** A step as the list edits it: every text as the input holds it ("" = none), a time null = the app's default */
export type StepDraft = { id: string; action: StepAction } & Record<StepText, string> & Record<StepTime, number | null>;

export const stepDraftOf = (step: StepData): StepDraft => ({
  id: step.id,
  title: step.title ?? "",
  description: step.description ?? "",
  footer: step.footer ?? "",
  illustration: step.illustration ?? "",
  button: step.button ?? "",
  action: step.action ?? "next",
  fadeIn: step.fadeIn ?? null,
  stagger: step.stagger ?? null,
  advance: step.advance ?? null,
});

/** The steps as the API takes them: in order (the index is the place), empty texts and default times left out */
export const stepsData = (drafts: readonly StepDraft[]): StepData[] =>
  drafts.map((draft, index) => {
    const step: StepData = { id: draft.id, index };
    for (const key of STEP_TEXTS) if (draft[key].trim()) step[key] = draft[key].trim();
    if (step.button && draft.action !== "next") step.action = draft.action;
    for (const key of STEP_TIMES) if (draft[key] !== null) step[key] = Math.round(draft[key]!);
    return step;
  });

/** The list differs from the steps as saved */
export const stepsDirty = (saved: readonly StepData[], drafts: readonly StepDraft[]): boolean =>
  JSON.stringify(stepsData(drafts)) !== JSON.stringify(stepsData(saved.map(stepDraftOf)));

/** What keeps Save off */
export const stepsProblems = (drafts: readonly StepDraft[]): string[] => {
  const problems: string[] = [];
  if (drafts.length > STEPS_MAX) problems.push(`More than ${STEPS_MAX} steps.`);
  const seen = new Set<string>();
  drafts.forEach((draft, i) => {
    const at = `Step ${i + 1}`;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(draft.id)) problems.push(`${at}: the id is 1–64 letters, digits, _ or -.`);
    else if (seen.has(draft.id)) problems.push(`${at}: the id ${draft.id} is used twice.`);
    seen.add(draft.id);
    for (const key of STEP_TEXTS) {
      const max = key === "description" ? BODY_MAX_LENGTH : TEXT_MAX_LENGTH;
      if (draft[key].trim().length > max) problems.push(`${at}: the ${key} is longer than ${max} characters.`);
    }
    if (draft.action !== "next" && !draft.button.trim()) problems.push(`${at}: the action ${draft.action} needs a button.`);
    for (const key of STEP_TIMES) {
      const value = draft[key];
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > STEP_TIME_MAX)) problems.push(`${at}: ${key} is 0 to ${STEP_TIME_MAX} ms.`);
    }
  });
  return problems;
};

/** A new, empty step with the first free id `step-<n>` */
export const newStep = (drafts: readonly StepDraft[]): StepDraft => {
  const ids = new Set(drafts.map(d => d.id));
  let n = drafts.length + 1;
  while (ids.has(`step-${n}`)) n++;
  return stepDraftOf({ id: `step-${n}`, index: drafts.length });
};

/** The list with step `index` moved one place up (-1) or down (1); unchanged at an end */
export const moveStep = <T>(list: readonly T[], index: number, by: -1 | 1): T[] => {
  const to = index + by;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
};

/** A closed step's head: its first words and what moves it on (a button and its action, or its own time) */
export const stepSummary = (draft: StepDraft): string => {
  const text = (draft.title || draft.description).replace(/\s+/g, " ").trim();
  const words = text.length > 40 ? `${text.slice(0, 39)}…` : text;
  const moves = draft.button.trim() ? `${draft.button.trim()}${draft.action !== "next" ? ` → ${draft.action}` : ""}` : draft.advance !== null ? `on after ${draft.advance} ms` : "on by a tap";
  return [words, moves].filter(Boolean).join(" · ");
};

export { STEP_ACTIONS };
