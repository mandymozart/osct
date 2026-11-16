import { GameStoreService } from "@/services";
import type { IGame, ListCategory } from "@/types";
import { adoptDesignStyles } from "@/styles";
import { categoryLabel, DEFAULT_CATEGORY, MARGINALIA_MENU } from "./entries-model";
import { escapeHtml } from "@/utils";
import { t } from "i18next";

/**
 * The Marginalia menu of the entries list (#286): a glass pill acting as a burger dropdown (≡ beside the label) with
 * Glossary ("Marginalia"), Texts, Links and All. When open it grows downwards into the menu (same width and left edge,
 * the selected choice on top, on the label); the choices are one radio group – the selected one gold, the others white.
 * Choosing one navigates to `/entries` with it. Closes on an outside tap and Escape. The page sets `value`; a value
 * outside the menu (the Videos) shows the pill as "Marginalia", white and without glow, nothing selected.
 */
export class EntriesFilterElement extends HTMLElement {
  private game: Readonly<IGame>;
  private _value: ListCategory = DEFAULT_CATEGORY;
  private open = false;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  get value(): ListCategory {
    return this._value;
  }

  set value(value: ListCategory) {
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
    const selected = MARGINALIA_MENU.includes(this._value) ? this._value : null;
    // The selected choice first (it lies on the label), the others in menu order
    const choices = selected ? [selected, ...MARGINALIA_MENU.filter(c => c !== selected)] : MARGINALIA_MENU;
    const item = (category: ListCategory) =>
      `<li><button type="button" class="${category === selected ? "gold" : "white"}" role="menuitemradio" data-filter="${category}" aria-checked="${category === selected}">${escapeHtml(categoryLabel(category))}</button></li>`;
    const label = selected ? categoryLabel(selected) : t("entries:marginalia");
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host { display: block; position: relative; min-width: var(--category-width); width: max-content; }
        /* :host raises specificity – the adopted design sheet comes after this <style> */
        :host .pill { width: 100%; gap: .4em; }
        /* Outside its section (the Videos) the pill is white and does not glow gold (#286) */
        :host .pill.inactive { box-shadow: var(--shadow-grey); }
        .burger { font-size: 1.1em; line-height: 1; }
        .white { color: var(--color-on-dark); }
        .menu {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 1;
          box-sizing: border-box;
          min-width: 100%;
          margin: 0;
          padding: .3rem 0 .55rem;
          list-style: none;
          border-radius: 1.45rem;
          background: var(--glass-background);
          -webkit-backdrop-filter: var(--glass-blur);
          backdrop-filter: var(--glass-blur);
          box-shadow: var(--shadow-bronze);
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
          padding: 0 1rem;
          border: none;
          /* Only the color: background: none would also remove the .gold gradient (more specific) */
          background-color: transparent;
          font: inherit;
          letter-spacing: inherit;
          line-height: 1.5;
          text-align: center;
          white-space: nowrap;
          cursor: pointer;
        }
      </style>
      <button type="button" class="pill design${selected ? "" : " inactive"}" data-action="toggle" aria-haspopup="menu" aria-expanded="${this.open}"><span class="${selected ? "gold" : "white"}"><span class="burger" aria-hidden="true">≡</span> <span class="label">${escapeHtml(label)}</span></span></button>
      ${this.open ? `<ul class="menu" role="menu" aria-label="${escapeHtml(t("entries:marginalia"))}">${choices.map(item).join("")}</ul>` : ""}
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
    const path = event.composedPath();
    if (!path.includes(this)) this.setOpen(false);
  };

  private handleKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.setOpen(false);
  };
}

customElements.define("entries-filter", EntriesFilterElement);
