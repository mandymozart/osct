import { ALL_CATEGORY, EntryCategory, type ListCategory, Pages } from "@/types";
import { getEntries } from "@/utils/game-config";
import { DEFAULT_CATEGORY, type EntriesFilterElement, type EntriesList, entriesOf, isListCategory } from "@/components/consultation";
import { goldButton } from "@/components/buttons";
import { ConsultationPage } from "./consultation-page";
import { t } from "i18next";

/**
 * Entries list (#286): on the left `<entries-filter>` (the Marginalia menu: Glossary, Texts, Links, All) with the
 * category's counter below it ("32 / 60 / Marginalia consulted" – the same count as the header's, per category; none
 * for All), on the right the Videos button; then `<entries-list>` with every entry of the category.
 */
export class EntriesPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      /* Leaves room for the "Marginalia consulted" counter the header shows on this page only */
      .content { padding-top: var(--consultation-top-counter); }
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 2.25rem;
      }
      .marginalia {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: .6rem;
      }
      .count { text-align: center; font-size: var(--text-size-small); }
      .count[hidden] { display: none; }
      .count .noun { display: block; max-width: var(--category-width); }
      /* The Videos button: gold and glowing when it is the list shown, white otherwise (#286) */
      .toolbar .videos:not(.selected) { box-shadow: var(--shadow-grey); }
      .toolbar .videos:not(.selected) .gold {
        background: none;
        color: var(--color-on-dark);
        -webkit-text-fill-color: currentColor;
      }
    `;
  }

  get template(): string {
    return /* html */ `
      <div class="content">
        <div class="toolbar">
          <div class="marginalia">
            <entries-filter></entries-filter>
            <div class="count gold"></div>
          </div>
          ${goldButton({ label: t("entries:categories.video"), className: "videos", attrs: { "data-action": "videos" } })}
        </div>
        <entries-list></entries-list>
      </div>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot?.addEventListener("click", this.handleVideos);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.shadowRoot?.removeEventListener("click", this.handleVideos);
  }

  private handleVideos = (event: Event) => {
    if ((event.target as HTMLElement).closest("[data-action=videos]")) {
      this.game.router.navigate("/entries", { key: "category", value: EntryCategory.Video });
    }
  };

  /** Route param → category; without a param (the "Marginalia" button) the last list viewed */
  private get category(): ListCategory {
    const param = this.routeParam(Pages.ENTRIES);
    if (isListCategory(param)) return param;
    return this.game.state.progress.lastCategory ?? DEFAULT_CATEGORY;
  }

  protected update(): void {
    if (this.game.state.currentRoute?.page !== Pages.ENTRIES) return;
    const root = this.shadowRoot;
    const filter = root?.querySelector<EntriesFilterElement>("entries-filter");
    const list = root?.querySelector<EntriesList>("entries-list");
    const count = root?.querySelector<HTMLElement>(".count");
    const videos = root?.querySelector<HTMLElement>("[data-action=videos]");
    if (!filter || !list || !count || !videos) return;

    const category = this.category;
    this.game.history.setLastCategory(category);

    const entries = entriesOf(getEntries(), category);
    filter.value = category;
    videos.classList.toggle("selected", category === EntryCategory.Video);
    videos.setAttribute("aria-pressed", String(category === EntryCategory.Video));

    // A counter per category, counted like the header's (only entries in the content); none for All and the Videos
    const counted = category !== ALL_CATEGORY && category !== EntryCategory.Video;
    count.hidden = !counted;
    if (counted) {
      const consulted = this.game.history.getConsultedCount(category);
      const total = entries.length;
      count.innerHTML = `${consulted} / ${total}<span class="noun">${t(`entries:consulted.${category}`)}</span>`;
      count.setAttribute("aria-label", t("entries:countAria", { consulted, total, noun: t(`entries:consulted.${category}`) }));
    }
    list.setEntries(category, entries);
  }
}

customElements.define("entries-page", EntriesPage);
