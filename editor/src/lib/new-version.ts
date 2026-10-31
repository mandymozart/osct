/**
 * The new-version bar: a deploy replaces the editor's code under an open tab, and the tab keeps running the old code
 * until it reloads. SvelteKit's `updated` says when the deployed `version.json` differs from the running build (a poll,
 * focus and visibility checks – `NewVersionBar.svelte`), and a code file that fails to load says the same
 * (`stale-chunks.ts`). The bar never reloads on its own: with unsaved edits it says that a reload drops them and offers
 * to reload once nothing is left unsaved (*Reload after saving*) – the person chooses.
 */

/** What the bar decides from */
export interface VersionState {
  /** A new version is deployed, or a code file of the running one could not be loaded */
  ready: boolean;
  /** A panel holds edits that are not in the draft (`unsaved.ts`) */
  unsaved: boolean;
  /** The person chose *Reload after saving* */
  waiting: boolean;
  /** The person hid the bar (*Later*) */
  dismissed: boolean;
}

export type VersionAction = "reload" | "reload-after-saving";

export interface VersionBar {
  text: string;
  /** The buttons in order; the first is the primary one */
  actions: Array<{ action: VersionAction; label: string }>;
}

export const READY_TEXT = "A new version of the editor is ready";

/** The bar for a state, or null when nothing is shown */
export const versionBar = ({ ready, unsaved, waiting, dismissed }: VersionState): VersionBar | null => {
  if (!ready || dismissed) return null;
  if (!unsaved) return { text: READY_TEXT, actions: [{ action: "reload", label: "Reload" }] };
  if (waiting) return { text: `${READY_TEXT} – it loads as soon as your edits are saved`, actions: [{ action: "reload", label: "Reload now" }] };
  return {
    text: `${READY_TEXT} – reloading now drops your unsaved edits`,
    actions: [{ action: "reload-after-saving", label: "Reload after saving" }, { action: "reload", label: "Reload now" }],
  };
};

/** The page reloads by itself only after the person chose to wait for the save, once nothing is left unsaved */
export const reloadDue = ({ ready, unsaved, waiting, dismissed }: VersionState): boolean => ready && waiting && !unsaved && !dismissed;
