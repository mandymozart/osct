/**
 * The open state of the panels' collapsible sections, per section id, stored across visits
 * (`osct-editor-sections`, one JSON object). A section nobody has toggled yet takes its own default.
 */

const KEY = "osct-editor-sections";

const read = (): Record<string, boolean> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, boolean] => typeof e[1] === "boolean"));
  } catch {
    return {};
  }
};

class Sections {
  #open = $state<Record<string, boolean>>(read());

  isOpen(id: string, fallback: boolean): boolean {
    return this.#open[id] ?? fallback;
  }

  setOpen(id: string, open: boolean) {
    this.#open = { ...this.#open, [id]: open };
    try { localStorage.setItem(KEY, JSON.stringify(this.#open)); } catch { /* storage blocked */ }
  }

  toggle(id: string, fallback: boolean) {
    this.setOpen(id, !this.isOpen(id, fallback));
  }

  /** Read the stored state again (tests; another tab's changes) */
  reload() {
    this.#open = read();
  }
}

export const sections = new Sections();
