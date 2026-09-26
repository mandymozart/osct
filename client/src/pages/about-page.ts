import { ConsultationPage } from "./consultation-page";
import { getBook } from "@/utils/game-config";
import { tHtml } from "@/i18n";
import "@/components/settings";

/**
 * About = Info (design p.32–34), opened with "i" in consultation mode; "Entries" (top chrome) goes
 * back to the list. Info text, the settings (one component per section – Tutorial, History, Language;
 * later tools and account settings), colophon. Placeholder texts – the final texts belong in the
 * content (`book.yaml`) once they arrive (PLAN Phase 4).
 */
export class AboutPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      .section-title:first-child { margin-top: 0; }
      .settings { margin-bottom: 1.5rem; }
      .logo-link {
        display: inline-block;
        margin: .5rem 0 1rem;
        padding: .5rem .75rem;
        border-radius: .5rem;
        background: var(--color-on-dark);
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
        <h2 class="section-title">${tHtml("about.info")}</h2>
        <p>${tHtml("about.infoText", params)}</p>

        <h2 class="section-title">${tHtml("about.settings")}</h2>
        <div class="settings">
          <settings-tutorial></settings-tutorial>
          <settings-history></settings-history>
          <settings-language></settings-language>
        </div>

        <h2 class="section-title">${tHtml("about.colophon")}</h2>
        <p>${tHtml("about.author", params)}<br>${tHtml("about.publishedBy")}</p>
        <a class="logo-link" href="https://buildingfictions.com" target="_blank" rel="noopener noreferrer">
          <img src="/assets/bf.svg" class="logo" alt="buildingfictions" />
        </a>
        <p>${tHtml("about.appBy")}</p>
        <div class="platforms">
          <p>${tHtml("about.requirements")}</p>
          <p>${tHtml("about.android")}</p>
          <p>${tHtml("about.desktop")}</p>
          <p>${tHtml("about.ios")}</p>
        </div>
      </div>
    `;
  }

  protected update(): void {
    // Static page – the settings sections render themselves
  }
}

customElements.define("about-page", AboutPage);
