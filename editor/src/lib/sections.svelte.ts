/**
 * The open state of the panels' collapsible sections, per section id, stored across visits
 * (`osct-editor-sections`, one JSON object). A section nobody has toggled yet takes its own default.
 * A nested section (a look's moment – reveal, found, lost –, a pass) keeps its state only while the editor is open
 * (#338): the next visit starts with its default again, so the long lists inside a section start short.
 */

import { readStoredJson, writeStoredJson } from "#lib/storage.js";

const KEY = "osct-editor-sections";

const read = (): Record<string, boolean> => {
  const parsed = readStoredJson(KEY);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, boolean] => typeof e[1] === "boolean"));
};

class Sections {
  #open = $state<Record<string, boolean>>(read());
  /** The nested sections' state: this visit only, never stored */
  #visit = $state<Record<string, boolean>>({});

  isOpen(id: string, fallback: boolean, nested = false): boolean {
    return (nested ? this.#visit[id] : this.#open[id]) ?? fallback;
  }

  setOpen(id: string, open: boolean, nested = false) {
    if (nested) {
      this.#visit = { ...this.#visit, [id]: open };
      return;
    }
    this.#open = { ...this.#open, [id]: open };
    writeStoredJson(KEY, this.#open);
  }

  toggle(id: string, fallback: boolean, nested = false) {
    this.setOpen(id, !this.isOpen(id, fallback, nested), nested);
  }

  /** Read the stored state again (tests; another tab's changes) */
  reload() {
    this.#open = read();
  }
}

export const sections = new Sections();
