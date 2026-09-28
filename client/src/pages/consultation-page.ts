import { PageMinimal } from "./page-minimal";
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";
import { t } from "i18next";

/**
 * Base of the consultation mode pages (entries list, entry, info – design p.15–34): dark, slightly
 * transparent full-screen page below the top chrome (Mark, counter, "i" in `header.ts`); the entry view and
 * Info put "Entries" in the page (`entriesToolbar()`), where the entries list has its category pill.
 * Subclasses provide `styles` and `template` and re-render through `update()`.
 */
export abstract class ConsultationPage extends PageMinimal {
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    adoptDesignStyles(this.shadowRoot);
  }

  /** Page frame only – colors, type and controls come from the tokens + shared primitives */
  public get baseStyles(): string {
    return /* css */ `
      :host {
        position: fixed;
        inset: 0;
        z-index: var(--page-z-index, 1000);
        overflow-y: auto;
        overscroll-behavior: contain;
        pointer-events: all;
        background: var(--consultation-background);
        color: var(--color-on-dark);
        font-family: var(--font-design);
        letter-spacing: var(--tracking-design);
        font-size: var(--text-size);
        line-height: var(--text-line);
        opacity: 0;
        visibility: hidden;
        transition: opacity .25s ease, visibility .25s;
      }
      :host([active=true]) {
        opacity: 1;
        visibility: visible;
      }
      .content {
        box-sizing: border-box;
        max-width: 36rem;
        margin: 0 auto;
        padding: var(--consultation-top) 1.25rem calc(3rem + env(safe-area-inset-bottom));
      }
      p { margin: 0 0 1em; white-space: pre-line; }
      a { color: var(--color-accent); }

      /* Entry view and Info (Tilman 2026-09-27): the entries list's positions – "Entries" where its category
         pill is, the content where its list starts (the same toolbar: pill, gap, one line, gap below) */
      .content.below-toolbar { padding-top: var(--consultation-top-counter); }
      .entries-toolbar {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: .6rem;
        margin-bottom: 2.25rem;
      }
      .entries-toolbar::after { content: ""; height: calc(var(--text-size) * var(--text-line)); }
    `;
  }

  /** "Entries" → back to the list with the last category; put it first in `<div class="content below-toolbar">` */
  protected entriesToolbar(): string {
    return `<div class="entries-toolbar">${goldButton({ label: t("header:entries"), attrs: { "data-action": "entries" } })}</div>`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot?.addEventListener("click", this.handleEntries);
    // Re-render on route (param) and progress changes
    const game = this.game;
    const onChange = () => this.update();
    const cleanups = [game.subscribeToProperty("currentRoute", onChange), game.subscribeToProperty("progress", onChange)];
    this.unsubscribe = () => cleanups.forEach(c => c());
    this.update();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.shadowRoot?.removeEventListener("click", this.handleEntries);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private handleEntries = (event: Event) => {
    if ((event.target as HTMLElement).closest("[data-action=entries]")) this.game.router.navigate("/entries");
  };

  /** Route param of this page, if the current route is this page */
  protected routeParam(page: string): string | null {
    const route = this.game.state.currentRoute;
    return route?.page === page && route.param ? String(route.param.value) : null;
  }

  protected abstract update(): void;
}
