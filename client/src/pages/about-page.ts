import { ConsultationPage } from "./consultation-page";
import { getBook } from "@/utils/game-config";
import i18next from "i18next";
import "@/components/settings";

/**
 * About = Info (design p.32–34), opened with "i" in consultation mode; "Entries" (top chrome) goes
 * back to the list. Groups (Tilman 2026-09-27): Info text · Account (the progress – what it is, reset –
 * then sign-in and the update options) · Settings (sound & vibration, language, home screen) · colophon – one component per section. Placeholder texts – the final texts belong in the
 * content (`book.yaml`) once they arrive (PLAN Phase 4).
 */
export class AboutPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      .section-title:first-child { margin-top: 0; }
      .settings { margin-bottom: 1.5rem; }
      /* White letters on the page's black (bf.svg is white, transparent around) */
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
      <div class="content">
        <h2 class="section-title">${i18next.t("about:info")}</h2>
        <p>${i18next.t("about:infoText", params)}</p>

        <h2 class="section-title">${i18next.t("about:account")}</h2>
        <div class="settings">
          <settings-history></settings-history>
          <settings-account></settings-account>
        </div>

        <h2 class="section-title">${i18next.t("about:settings")}</h2>
        <div class="settings">
          <settings-feedback></settings-feedback>
          <settings-language></settings-language>
          <settings-install></settings-install>
        </div>

        <h2 class="section-title">${i18next.t("about:colophon")}</h2>
        <p>${i18next.t("about:author", params)}<br>${i18next.t("about:publishedBy")}</p>
        <a class="logo-link" href="https://buildingfictions.com" target="_blank" rel="noopener noreferrer">
          <img src="/assets/bf.svg" class="logo" alt="buildingfictions" />
        </a>
        <p>${i18next.t("about:appBy")}</p>
        <div class="platforms">
          <p>${i18next.t("about:requirements")}</p>
          <p>${i18next.t("about:android")}</p>
          <p>${i18next.t("about:desktop")}</p>
          <p>${i18next.t("about:ios")}</p>
        </div>
      </div>
    `;
  }

  protected update(): void {
    // Static page – the settings sections render themselves
  }
}

customElements.define("about-page", AboutPage);
