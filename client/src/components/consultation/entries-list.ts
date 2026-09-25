import { GameStoreService } from "@/services";
import { Entry, IGame } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { escapeHtml } from "@/utils";
import { BOOKMARKED, DEFAULT_CATEGORY, EntriesFilter, entryLabel, groupEntries, sortEntries } from "./entries-model";
import { ICONS } from "./icons";

/**
 * Entries of one filter (design p.17, 19, 24, 29): sorted by title, the glossary grouped by letter, one
 * gold gradient across the whole list; bookmark and note markers per row. The page passes the visible
 * entries (`setEntries`); tap → the entry view.
 */
export class EntriesList extends HTMLElement {
  private game: Readonly<IGame>;
  private filter: EntriesFilter = DEFAULT_CATEGORY;
  private entries: Entry[] = [];

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  /** Show `entries` (already filtered) for `filter` – decides grouping and the empty text */
  setEntries(filter: EntriesFilter, entries: Entry[]) {
    this.filter = filter;
    this.entries = entries;
    this.render();
  }

  connectedCallback() {
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.render();
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host { display: block; }
        ul { margin: 0; padding: 0; list-style: none; }
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
        .empty { margin: 0; color: var(--color-muted); }
      </style>
      ${this.listHtml()}
    `;
  }

  private listHtml(): string {
    if (this.entries.length === 0) {
      return `<p class="empty">${this.filter === BOOKMARKED ? "No bookmarked entries yet." : "No entries consulted yet."}</p>`;
    }
    const groups = this.filter === BOOKMARKED
      ? [{ letter: null, entries: sortEntries(this.entries) }]
      : groupEntries(this.entries, this.filter);
    // One gold gradient across the whole list (frames 17/19/24: titles run from pale to gold)
    return `<ul class="gold">${groups
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
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-entry]");
    if (el?.dataset.entry) this.game.router.navigate("/entry", { key: "entryId", value: el.dataset.entry });
  };
}

customElements.define("entries-list", EntriesList);
