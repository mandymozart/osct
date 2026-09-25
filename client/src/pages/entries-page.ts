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
      /* Dropdown (frame 18): the pill grows into a rounded glass panel with the four categories */
      .menu {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1;
        margin: 0;
        padding: .5rem 0;
        list-style: none;
        border-radius: 1rem;
        background: var(--glass-background);
        -webkit-backdrop-filter: var(--glass-blur);
        backdrop-filter: var(--glass-blur);
        box-shadow: var(--shadow-dark);
      }
      .menu button {
        display: block;
        width: 100%;
        padding: .1rem 1.1rem;
        border: none;
        /* Only the color: background: none would also remove the .gold gradient (more specific) */
        background-color: transparent;
        font: inherit;
        letter-spacing: inherit;
        text-align: center;
        cursor: pointer;
      }
      .menu button[aria-current="true"] { text-decoration: underline; text-underline-offset: .2em; }
      .menu .divider { height: 1px; margin: .35rem .8rem; background: var(--color-muted); }
      .count { min-width: 6rem; text-align: center; }
      ul.list { margin: 0; padding: 0; list-style: none; }
      .row {
        display: flex;
        align-items: center;
        gap: .5rem;
        width: 100%;
        min-height: var(--row-height);
        padding: 0;
        border: none;
        border-top: var(--rule);
        border-bottom: var(--rule);
        margin-top: -1px;
        background: none;
        font: inherit;
        letter-spacing: inherit;
        text-align: left;
        cursor: pointer;
      }
      .row .label { flex: 1; }
      /* Icons use currentColor – flat gold, the list's gradient can't reach SVG strokes */
      .row .marks { display: flex; gap: .3rem; color: var(--color-accent); -webkit-text-fill-color: var(--color-accent); }
      /* Locked (dev only): grey instead of the list's gold */
      .row.locked { color: var(--color-muted); -webkit-text-fill-color: var(--color-muted); }
      .row.locked .label::after { content: " – locked"; font-size: var(--text-size-small); }
      .letter {
        display: flex;
        align-items: flex-end;
        min-height: calc(var(--row-height) * 2);
        border-bottom: var(--rule);
      }
      .empty { color: var(--color-muted); }
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
          <button type="button" class="pill design" data-action="toggle-menu" aria-haspopup="true" aria-expanded="${this.menuOpen}"><span class="gold">${label}</span></button>
          ${this.menuOpen ? this.menuHtml(filter) : ""}
        </div>
        <div class="count gold" aria-label="${consulted} of ${inFilter.length} consulted">${consulted} / ${inFilter.length}</div>
      </div>
      ${this.listHtml(filter, inFilter.filter(visible))}
    `;
  }

  private menuHtml(current: EntriesFilter): string {
    const item = (value: EntriesFilter, text: string) =>
      `<li><button type="button" class="gold" data-filter="${value}" aria-current="${value === current}">${text}</button></li>`;
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
    // One gold gradient across the whole list (frames 17/19/24: titles run from pale to gold)
    return `<ul class="list gold">${groups
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
