import { ConsultationPage } from "./consultation-page";
import { getExperience } from "@/utils/game-config";
import { t } from "i18next";
import "@/components/settings";

/**
 * Info page (#291), opened with "i" in consultation mode; the gold × in the header closes it to the entries list.
 * Sections, in the design's order: info text with the link to the image credits (#292) · install as app · Account
 * (sign-in, progress explanation and reset, update options) · Settings (sound & vibration, language, then graphics and
 * the download, which the design leaves out – kept, RULES #1) · colophon, its lines as in the design (p. 61; no logo,
 * #297). The texts are placeholders until they move into the content (`experience.yaml`). The image tracking library is credited in the project README, not here; its MIT
 * LICENSE is served next to the engine (`assets/xr8/LICENSE`).
 */
export class AboutPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      .section-title:first-of-type { margin-top: 0; }
      .settings { margin-bottom: 1.5rem; }
      .colophon p, .platforms p { margin: 0; }
      .colophon { margin-bottom: 1em; }
    `;
  }

  get template(): string {
    const experience = getExperience();
    const params = { title: experience.title, author: experience.book?.author ?? "" };
    const here = `<a href="/credits" data-action="credits">${t("about:here")}</a>`;
    return /* html */ `
      <div class="content">
        <h2 class="section-title">${t("about:info")}</h2>
        <p>${t("about:infoText", params)}</p>
        <p>${t("about:scanText")}</p>
        <p>${t("about:creditsText", { here })}</p>
        <div class="settings">
          <settings-install></settings-install>
        </div>

        <h2 class="section-title">${t("about:account")}</h2>
        <div class="settings">
          <settings-account></settings-account>
          <settings-history></settings-history>
        </div>

        <h2 class="section-title">${t("about:settings")}</h2>
        <div class="settings">
          <settings-feedback></settings-feedback>
          <settings-language></settings-language>
          <settings-graphics></settings-graphics>
          <settings-embeds></settings-embeds>
          <settings-download></settings-download>
        </div>

        <h2 class="section-title">${t("about:colophon")}</h2>
        <div class="colophon">
          <p>${t("about:author", params)}</p>
          <p>${t("about:appDevelopment")}</p>
          <p>${t("about:design")}</p>
          <p>${t("about:glossaryEditing")}</p>
          <p>${t("about:font")}</p>
          <p>${t("about:publisher")}</p>
          <p>${t("about:isbn")}</p>
        </div>
        <div class="platforms colophon">
          <p>${t("about:requirements")}</p>
          <p>${t("about:android")}</p>
          <p>${t("about:desktop")}</p>
          <p>${t("about:ios")}</p>
        </div>
        <p>${t("about:copyright", params)}</p>
      </div>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot?.addEventListener("click", this.handleCredits);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.shadowRoot?.removeEventListener("click", this.handleCredits);
  }

  /** "here" → the image credits; a plain link without the app (a new tab) still works */
  private handleCredits = (event: Event) => {
    const link = (event.target as HTMLElement).closest("[data-action=credits]");
    if (!link || (event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey) return;
    event.preventDefault();
    this.game.router.navigate("/credits");
  };

  protected update(): void {
    // Static page: the settings sections render themselves
  }
}

customElements.define("about-page", AboutPage);
