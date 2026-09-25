import { GameStoreService } from "@/services";
import { Entry, EntryCategory, IGame } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { escapeHtml } from "@/utils";
import { DEFAULT_CATEGORY, entryLabel, groupEntries } from "./entries-model";

/**
 * Entries of one category (design p.17, 19, 24, 29): sorted by title, the glossary grouped by letter, one
 * gold gradient across the whole list. The page passes the visible entries (`setEntries`); tap → the entry
 * view.
 */
export class EntriesList extends HTMLElement {
  private game: Readonly<IGame>;
  private category: EntryCategory = DEFAULT_CATEGORY;
  private entries: Entry[] = [];

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  /** Show `entries` (already filtered) of `category` – the category decides the grouping */
  setEntries(category: EntryCategory, entries: Entry[]) {
    this.category = category;
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
      return `<p class="empty">No entries consulted yet.</p>`;
    }
    const groups = groupEntries(this.entries, this.category);
    // One gold gradient across the whole list (frames 17/19/24: titles run from pale to gold)
    return `<ul class="gold">${groups
      .map(g => `${g.letter ? `<li class="letter" aria-hidden="true">${g.letter}</li>` : ""}${g.entries.map(e => this.rowHtml(e)).join("")}`)
      .join("")}</ul>`;
  }

  private rowHtml(entry: Entry): string {
    const history = this.game.history;
    const locked = !history.isConsulted(entry.id);
    return /* html */ `
      <li><button type="button" class="row${locked ? " locked" : ""}" data-entry="${escapeHtml(entry.id)}">
        <span class="label">${escapeHtml(entryLabel(entry))}</span>
      </button></li>`;
  }

  private handleClick = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-entry]");
    if (el?.dataset.entry) this.game.router.navigate("/entry", { key: "entryId", value: el.dataset.entry });
  };
}

customElements.define("entries-list", EntriesList);
