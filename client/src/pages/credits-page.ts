import { ConsultationPage } from "./consultation-page";
import { escapeHtml } from "@/utils";
import { getCredits } from "@/utils/game-config";
import { matterOf } from "@shared/types/game-config";
import type { Spread } from "@/types";
import { t } from "i18next";

/**
 * Image credits (#292), opened from the Info page's "here" link; × in the header goes back to Info. The credit lines of
 * the pictures in the book's margins, grouped by spread – the configuration's `credits` (schema 2.33), written per file
 * in the editor's Library, so a credit edited there reaches this page with the next publish.
 */
export class CreditsPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      .section-title:first-of-type { margin-top: 0; }
      .credits {
        margin: 0 0 1.5rem;
        padding: 0;
        list-style: none;
        font-size: var(--text-size-small);
      }
      .credits li { margin: 0 0 .75em; overflow-wrap: anywhere; }
    `;
  }

  get template(): string {
    const groups = getCredits();
    return /* html */ `
      <div class="content">
        <h2 class="section-title">${t("about:imageCredits")}</h2>
        ${groups.length
          ? groups.map(({ spread, lines }) => `
              <h3 class="section-title">${escapeHtml(spreadLabel(spread))}</h3>
              <ul class="credits">${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`).join("")
          : `<p class="muted">${t("about:noCredits")}</p>`}
      </div>
    `;
  }

  protected update(): void {
    // Static page: the credits change only with the content
  }
}

/** "Pages 2–3"; a spread without printed numbers (cover, back, front and back matter) by its title */
export const spreadLabel = (spread: Pick<Spread, "title" | "format" | "matter" | "firstPage" | "lastPage">): string => {
  if (spread.format === "cover" || spread.format === "back" || matterOf(spread)) return spread.title;
  return spread.firstPage === spread.lastPage
    ? t("about:page", { page: spread.firstPage })
    : t("about:pages", { first: spread.firstPage, last: spread.lastPage });
};

customElements.define("credits-page", CreditsPage);
