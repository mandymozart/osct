import { ConsultationPage } from "./consultation-page";
import { escapeHtml } from "@/utils";
import { getCredits } from "@/utils/game-config";
import { sceneLabel } from "@engine/content/scenes";
import { t } from "i18next";

/**
 * Image credits (#292), opened from the Info page's "here" link; × in the header goes back to Info. The credit lines of
 * the pictures in the book's margins, grouped by scene (its label) – the configuration's `credits` (schema 2.33), written per file
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
          ? groups.map(({ scene, lines }) => `
              <h3 class="section-title">${escapeHtml(sceneLabel(scene))}</h3>
              <ul class="credits">${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`).join("")
          : `<p class="muted">${t("about:noCredits")}</p>`}
      </div>
    `;
  }

  protected update(): void {
    // Static page: the credits change only with the content
  }
}

customElements.define("credits-page", CreditsPage);
