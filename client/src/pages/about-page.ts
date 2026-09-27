import { ConsultationPage } from "./consultation-page";
import { getBook } from "@/utils/game-config";
import i18next from "i18next";
import { goldButton } from "@/components/buttons";
import "@/components/settings";

/**
 * About = Info (design p.32–34), opened with "i" in consultation mode; "Entries" (in the page, where the
 * entries list has its category pill) goes back to the list. Groups (Tilman 2026-09-27): Info text · Account (the progress – what it is, reset –
 * then sign-in and the update options) · Settings (sound & vibration, language, home screen, download) · colophon – one component per section.
 * Placeholder texts – the final texts belong in the content (`book.yaml`) once they arrive (PLAN Phase 4).
 */
export class AboutPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      /* The entries list's positions (Tilman 2026-09-27): "Entries" where its category pill is, the text
         where its list starts – the same toolbar height (pill, gap, one line) and gap below */
      .content { padding-top: var(--consultation-top-counter); }
      .toolbar {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: .6rem;
        margin-bottom: 2.25rem;
      }
      .toolbar::after { content: ""; height: calc(var(--text-size) * var(--text-line)); }
      .section-title:first-of-type { margin-top: 0; }
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
        <div class="toolbar">
          ${goldButton({ label: i18next.t("header:entries"), attrs: { "data-action": "entries" } })}
        </div>
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
          <settings-download></settings-download>
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

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot?.addEventListener("click", this.handleClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.shadowRoot?.removeEventListener("click", this.handleClick);
  }

  protected update(): void {
    // Static page – the settings sections render themselves
  }

  /** "Entries" → back to the list with the last category (like the header's pill on the entry view) */
  private handleClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest("[data-action=entries]");
    if (button) this.game.router.navigate("/entries");
  };
}

customElements.define("about-page", AboutPage);
