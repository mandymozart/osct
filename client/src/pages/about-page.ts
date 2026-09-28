import { ConsultationPage } from "./consultation-page";
import { getBook } from "@/utils/game-config";
import { t } from "i18next";
import "@/components/settings";

/**
 * Info page, opened with "i" in consultation mode; "Entries" goes back to the list. Sections, one component
 * each: info text · Account (progress explanation and reset, sign-in, update options) · Settings (sound &
 * vibration, language, home screen, download) · colophon. The texts are placeholders until they move
 * into the content (`book.yaml`). The image tracking library is credited in the project README (Tilman,
 * 2026-09-28), not here; its MIT LICENSE is served next to the engine (`assets/xr8/LICENSE`).
 */
export class AboutPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      .section-title:first-of-type { margin-top: 0; }
      .settings { margin-bottom: 1.5rem; }
      .logo-link {
        display: inline-block;
        margin: .5rem 0 1rem;
      }
      .logo { display: block; height: 3rem; }
      .platforms p { margin: 0; }
    `;
  }

  get template(): string {
    const book = getBook();
    const params = { title: book.title, author: book.author };
    return /* html */ `
      <div class="content below-toolbar">
        ${this.entriesToolbar()}
        <h2 class="section-title">${t("about:info")}</h2>
        <p>${t("about:infoText", params)}</p>

        <h2 class="section-title">${t("about:account")}</h2>
        <div class="settings">
          <settings-history></settings-history>
          <settings-account></settings-account>
        </div>

        <h2 class="section-title">${t("about:settings")}</h2>
        <div class="settings">
          <settings-feedback></settings-feedback>
          <settings-language></settings-language>
          <settings-install></settings-install>
          <settings-download></settings-download>
        </div>

        <h2 class="section-title">${t("about:colophon")}</h2>
        <p>${t("about:author", params)}<br>${t("about:publishedBy")}</p>
        <a class="logo-link" href="https://buildingfictions.com" target="_blank" rel="noopener noreferrer">
          <img src="/assets/bf.svg" class="logo" alt="buildingfictions" />
        </a>
        <p>${t("about:appBy")}</p>
        <div class="platforms">
          <p>${t("about:requirements")}</p>
          <p>${t("about:android")}</p>
          <p>${t("about:desktop")}</p>
          <p>${t("about:ios")}</p>
        </div>
      </div>
    `;
  }

  protected update(): void {
    // Static page: the settings sections render themselves
  }
}

customElements.define("about-page", AboutPage);
