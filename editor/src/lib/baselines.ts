import { SvelteMap } from "svelte/reactivity";

/**
 * What *Undo edits* goes back to (#259): edits reach the draft by themselves, so the draft is no place to go back to –
 * each subject (a target's tree, a spread's passes, an entry, …) keeps how the draft had it when its first edit was
 * made in this page, until the page is left. Kept as text, so nothing edited later reaches into it. Reactive: a panel
 * reads `differsFromBaseline` in a `$derived`.
 */
const firsts = new SvelteMap<string, string>();

const text = (value: unknown): string => JSON.stringify(value ?? null);

/** Before a subject's first edit: remember how the draft has it; later calls for the subject change nothing */
export const noteBaseline = (key: string, value: unknown): void => {
  if (!firsts.has(key)) firsts.set(key, text(value));
};

/** How the draft had the subject before its first edit here (`null`: it had none); undefined: never edited here */
export const baselineOf = <T>(key: string): T | null | undefined => {
  const first = firsts.get(key);
  return first === undefined ? undefined : (JSON.parse(first) as T | null);
};

/** The subject was edited here and is not as it was before */
export const differsFromBaseline = (key: string, value: unknown): boolean => {
  const first = firsts.get(key);
  return first !== undefined && first !== text(value);
};

/** Forget every baseline (tests) */
export const clearBaselines = (): void => firsts.clear();
