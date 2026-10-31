import { SvelteSet } from "svelte/reactivity";

/**
 * The editor's unsaved edits in one place: every panel that holds edits not yet in the draft (the ones with *Back to the
 * draft* and Save, the Code tab's source, the book's environment) registers a getter for its own dirty state while it
 * exists. `hasUnsaved()` is reactive (read in a `$derived`, it follows the registrations and each getter's state) – the
 * new-version bar asks it before it offers a reload.
 */
const sources = new SvelteSet<() => boolean>();

/** Register a dirty-state getter; returns the remover (an `onMount` cleanup) */
export const trackUnsaved = (dirty: () => boolean): (() => void) => {
  sources.add(dirty);
  return () => void sources.delete(dirty);
};

/** Some panel holds edits that are not in the draft */
export const hasUnsaved = (): boolean => {
  for (const dirty of sources) if (dirty()) return true;
  return false;
};
