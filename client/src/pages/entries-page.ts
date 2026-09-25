import { ENTRY_CATEGORIES, Entry, EntryCategory, Pages } from "@/types";
import { getEntries } from "@/utils/game-config";
import {
  CATEGORY_LABELS,
  DEFAULT_CATEGORY,
  entryLabel,
  escapeHtml,
  groupEntries,
  isCategory,
  showLockedEntries,
  sortEntries,
} from "@/components/consultation/entries-model";
import { ICONS } from "@/components/consultation/icons";
import { ConsultationPage } from "./consultation-page";

/** Filter of the list: a category, or all bookmarked entries (PLAN Phase 4, not in the design yet) */
type EntriesFilter = EntryCategory | "bookmarked";
const BOOKMARKED = "bookmarked";

/**
 * Entries list (design p.17–19, 24, 29): category dropdown ("burger menu"), consulted / total of the
 * category, entries sorted by title (glossary grouped by letter). Unconsulted entries are hidden; in
 * development they are listed locked (`showLockedEntries`). Tap → the entry view.
 */
export class EntriesPage extends ConsultationPage {
  private menuOpen = false;

  get styles(): string {
    return /* css */ `
      .toolbar {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: .6rem;
        margin-bottom: 2.25rem;
      }
      .category { position: relative; }
      .menu {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1;
        margin: 0;
        padding: .5rem 0;
        list-style: none;
        border-radius: 1rem;
        background: var(--consultation-pill);
        box-shadow: var(--glass-shadow);
      }
      .menu button {
        display: block;
        width: 100%;
        padding: .15rem 1.1rem;
        border: none;
        background: none;
        color: var(--color-accent);
        text-align: center;
        cursor: pointer;
      }
      .menu button[aria-current="true"] { text-decoration: underline; text-underline-offset: .2em; }
      .menu .divider { height: 1px; margin: .35rem .8rem; background: var(--consultation-rule); }
      .count {
        min-width: 6rem;
        text-align: center;
        font-size: .8rem;
        color: var(--consultation-text);
      }
      .count .consulted { color: var(--color-accent); }
      ul.list { margin: 0; padding: 0; list-style: none; }
      .row {
        display: flex;
        align-items: center;
        gap: .5rem;
        width: 100%;
        padding: .2rem 0;
        border: none;
        border-top: 1px solid var(--consultation-rule);
        border-bottom: 1px solid var(--consultation-rule);
        margin-top: -1px;
        background: none;
        color: var(--consultation-text);
        text-align: left;
        font-size: .85rem;
        cursor: pointer;
      }
      .row .label { flex: 1; }
      .row .marks { display: flex; gap: .3rem; color: var(--color-accent); font-size: .8rem; }
      .row.locked { color: var(--consultation-muted); }
      .row.locked .label::after { content: " – locked"; font-size: .7rem; }
      .letter {
        padding: 1.05rem 0 .2rem;
        border-bottom: 1px solid var(--consultation-rule);
        font-size: .85rem;
      }
      .empty { color: var(--consultation-muted); font-size: .85rem; }
    `;
  }

  get template(): string {
    return /* html */ `<div class="content"></div>`;
  }

  setupEventListeners(): void {
    this.shadowRoot?.addEventListener("click", this.handleClick);
  }

  cleanupEventListeners(): void {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
  }

  /** Route param → filter; without param the last category (the "Entries" button, p.21) */
  private get filter(): EntriesFilter {
    const param = this.routeParam(Pages.ENTRIES);
    if (param === BOOKMARKED || isCategory(param)) return param;
    return this.game.state.progress.lastCategory ?? DEFAULT_CATEGORY;
  }

  protected update(): void {
    const content = this.shadowRoot?.querySelector(".content");
    if (!content || this.game.state.currentRoute?.page !== Pages.ENTRIES) return;
    const filter = this.filter;
    if (filter !== BOOKMARKED) this.game.history.setLastCategory(filter);

    const history = this.game.history;
    const all = getEntries();
    const inFilter = filter === BOOKMARKED ? all.filter(e => history.isMarked(e.id)) : all.filter(e => e.category === filter);
    const consulted = inFilter.filter(e => history.isConsulted(e.id)).length;
    const showLocked = showLockedEntries();
    const visible = (e: Entry) => showLocked || history.isConsulted(e.id);

    const label = filter === BOOKMARKED ? "Bookmarked" : CATEGORY_LABELS[filter];
    content.innerHTML = /* html */ `
      <div class="toolbar">
        <div class="category">
          <button type="button" class="pill" data-action="toggle-menu" aria-haspopup="true" aria-expanded="${this.menuOpen}">${label}</button>
          ${this.menuOpen ? this.menuHtml(filter) : ""}
        </div>
        <div class="count" aria-label="${consulted} of ${inFilter.length} consulted"><span class="consulted">${consulted}</span> / ${inFilter.length}</div>
      </div>
      ${this.listHtml(filter, inFilter.filter(visible))}
    `;
  }

  private menuHtml(current: EntriesFilter): string {
    const item = (value: EntriesFilter, text: string) =>
      `<li><button type="button" data-filter="${value}" aria-current="${value === current}">${text}</button></li>`;
    return /* html */ `
      <ul class="menu" role="menu">
        ${ENTRY_CATEGORIES.map(c => item(c, CATEGORY_LABELS[c])).join("")}
        <li class="divider" role="separator"></li>
        ${item(BOOKMARKED, "Bookmarked")}
      </ul>
    `;
  }

  private listHtml(filter: EntriesFilter, entries: Entry[]): string {
    if (entries.length === 0) {
      return `<p class="empty">${filter === BOOKMARKED ? "No bookmarked entries yet." : "No entries consulted yet."}</p>`;
    }
    const groups = filter === BOOKMARKED ? [{ letter: null, entries: sortEntries(entries) }] : groupEntries(entries, filter);
    return `<ul class="list">${groups
      .map(g => `${g.letter ? `<li class="letter" aria-hidden="true">${g.letter}</li>` : ""}${g.entries.map(e => this.rowHtml(e)).join("")}`)
      .join("")}</ul>`;
  }

  private rowHtml(entry: Entry): string {
    const history = this.game.history;
    const locked = !history.isConsulted(entry.id);
    const marks = [history.isMarked(entry.id) ? ICONS.bookmarked : "", history.getNote(entry.id) ? ICONS.note : ""].join("");
    return /* html */ `
      <li><button type="button" class="row${locked ? " locked" : ""}" data-entry="${escapeHtml(entry.id)}">
        <span class="label">${escapeHtml(entryLabel(entry))}</span>
        ${marks ? `<span class="marks">${marks}</span>` : ""}
      </button></li>`;
  }

  private handleClick = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-action], [data-filter], [data-entry]");
    if (!el) {
      if (this.menuOpen) this.setMenu(false);
      return;
    }
    if (el.dataset.action === "toggle-menu") {
      this.setMenu(!this.menuOpen);
    } else if (el.dataset.filter) {
      this.menuOpen = false;
      this.game.router.navigate("/entries", { key: "category", value: el.dataset.filter });
      this.update();
    } else if (el.dataset.entry) {
      this.game.router.navigate("/entry", { key: "entryId", value: el.dataset.entry });
    }
  };

  private setMenu(open: boolean) {
    this.menuOpen = open;
    this.update();
  }
}

customElements.define("entries-page", EntriesPage);
