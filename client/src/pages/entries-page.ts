import { Entry, EntryCategory, Pages } from "@/types";
import { getEntries } from "@/utils/game-config";
import { DEFAULT_CATEGORY, EntriesFilterElement, EntriesList, isCategory, showLockedEntries } from "@/components/consultation";
import { ConsultationPage } from "./consultation-page";
import i18next from "i18next";

/**
 * Entries list (design p.17–19, 24, 29): `<entries-filter>` (category dropdown), consulted / total of
 * the category below it, and `<entries-list>`. Unconsulted entries are hidden; in development they are
 * listed locked (`showLockedEntries`).
 */
export class EntriesPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      /* Toolbar (frames 17, 18): category pill + count below it */
      .toolbar {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: .6rem;
        margin-bottom: 2.25rem;
      }
      .count { width: var(--category-width); text-align: center; }
    `;
  }

  get template(): string {
    return /* html */ `
      <div class="content">
        <div class="toolbar">
          <entries-filter></entries-filter>
          <div class="count gold"></div>
        </div>
        <entries-list></entries-list>
      </div>
    `;
  }

  /** Route param → category; without param the last category (the "Entries" button, p.21) */
  private get category(): EntryCategory {
    const param = this.routeParam(Pages.ENTRIES);
    if (isCategory(param)) return param;
    return this.game.state.progress.lastCategory ?? DEFAULT_CATEGORY;
  }

  protected update(): void {
    if (this.game.state.currentRoute?.page !== Pages.ENTRIES) return;
    const root = this.shadowRoot;
    const filter = root?.querySelector<EntriesFilterElement>("entries-filter");
    const list = root?.querySelector<EntriesList>("entries-list");
    const count = root?.querySelector<HTMLElement>(".count");
    if (!filter || !list || !count) return;

    const category = this.category;
    this.game.history.setLastCategory(category);

    const history = this.game.history;
    const inCategory = getEntries().filter(e => e.category === category);
    const consulted = inCategory.filter(e => history.isConsulted(e.id)).length;
    const showLocked = showLockedEntries();
    const visible = (e: Entry) => showLocked || history.isConsulted(e.id);

    filter.value = category;
    count.textContent = `${consulted} / ${inCategory.length}`;
    count.setAttribute("aria-label", i18next.t("entries:countAria", { consulted, total: inCategory.length }));
    list.setEntries(category, inCategory.filter(visible));
  }
}

customElements.define("entries-page", EntriesPage);
