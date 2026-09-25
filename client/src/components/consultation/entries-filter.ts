import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types";
import { adoptDesignStyles } from "@/styles/design-styles";
import { goldButton } from "@/components/buttons";
import { DEFAULT_CATEGORY, ENTRIES_FILTERS, EntriesFilter, filterLabel } from "./entries-model";

/**
 * Category dropdown of the entries list (design p.17–18, "burger menu"): a glass pill with the current
 * filter; open, it grows downwards into the menu (same width and left edge, first item on the label).
 * Choosing an option navigates to `/entries` with that category. Closes on an outside tap and Escape.
 * The page sets `value`.
 */
export class EntriesFilterElement extends HTMLElement {
  private game: Readonly<IGame>;
  private _value: EntriesFilter = DEFAULT_CATEGORY;
  private open = false;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  get value(): EntriesFilter {
    return this._value;
  }

  set value(value: EntriesFilter) {
    if (value === this._value && this.shadowRoot?.childElementCount) return;
    this._value = value;
    this.open = false;
    this.render();
  }

  connectedCallback() {
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.render();
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.setOpen(false);
  }

  private render() {
    if (!this.shadowRoot) return;
    const item = (filter: EntriesFilter) =>
      `<li><button type="button" class="gold" role="menuitem" data-filter="${filter}" aria-current="${filter === this._value}">${filterLabel(filter)}</button></li>`;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host { display: block; position: relative; width: var(--category-width); }
        /* 52.5 pt ≈ 100 px: the label centred, and the open menu has the same width */
        /* :host raises specificity – the adopted design sheet comes after this <style> */
        :host .pill { width: 100%; box-shadow: var(--shadow-bronze); }
        /* Open (frame 18): the pill grows downwards */
        .menu {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 1;
          box-sizing: border-box;
          width: 100%;
          margin: 0;
          padding: .3rem 0 .55rem;
          list-style: none;
          border-radius: 1.45rem;          /* 12 pt */
          background: var(--glass-background);
          -webkit-backdrop-filter: var(--glass-blur);
          backdrop-filter: var(--glass-blur);
          box-shadow: var(--shadow-grey);
          animation: menu-open .18s ease-out;
        }
        @keyframes menu-open {
          from { clip-path: inset(0 0 calc(100% - 1.8rem) 0 round 1.45rem); }
          to { clip-path: inset(0 0 0 0 round 1.45rem); }
        }
        @media (prefers-reduced-motion: reduce) { .menu { animation: none; } }
        .menu button {
          display: block;
          width: 100%;
          padding: 0;
          border: none;
          /* Only the color: background: none would also remove the .gold gradient (more specific) */
          background-color: transparent;
          font: inherit;
          letter-spacing: inherit;
          line-height: 1.1875rem;          /* 10 pt between items */
          text-align: center;
          cursor: pointer;
        }
      </style>
      ${goldButton({ label: filterLabel(this._value), attrs: { "data-action": "toggle", "aria-haspopup": "menu", "aria-expanded": String(this.open) } })}
      ${this.open ? `<ul class="menu" role="menu">${ENTRIES_FILTERS.map(item).join("")}</ul>` : ""}
    `;
  }

  private setOpen(open: boolean) {
    if (open === this.open) return;
    this.open = open;
    window.removeEventListener("click", this.handleOutside);
    window.removeEventListener("keydown", this.handleKey);
    if (open) {
      // Registered after this click has finished bubbling
      window.setTimeout(() => {
        if (!this.open) return;
        window.addEventListener("click", this.handleOutside);
        window.addEventListener("keydown", this.handleKey);
      });
    }
    this.render();
  }

  private handleClick = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-action], [data-filter]");
    if (el?.dataset.action === "toggle") {
      this.setOpen(!this.open);
    } else if (el?.dataset.filter) {
      this.setOpen(false);
      this.game.router.navigate("/entries", { key: "category", value: el.dataset.filter });
    }
  };

  private handleOutside = (event: Event) => {
    if (!event.composedPath().includes(this)) this.setOpen(false);
  };

  private handleKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.setOpen(false);
  };
}

customElements.define("entries-filter", EntriesFilterElement);
