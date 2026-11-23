import { ConsultationPage } from "./consultation-page";
import { escapeHtml } from "@/utils";
import { getExperience } from "@/utils/game-config";
import { t } from "i18next";

/** Who is responsible for the app (#353, from buildingfictions.com/About and /Terms) – the same in every language */
export const PUBLISHER = {
  name: "Building Fictions",
  address: "Lauriergracht 116W, 1016 RR Amsterdam, the Netherlands",
  kvk: "58614796",
  email: "info@buildingfictions.com",
} as const;

/** The version of the text below: change it with every change of meaning */
export const PRIVACY_CHANGED = "2026-11-23";

/**
 * Privacy & terms (#353): who is responsible (Building Fictions, Amsterdam), what the app does with data (no tracking,
 * the device's storage, the account, the services that process data for us, other sites' videos only after the reader's
 * tap – #351, the reader's rights under the GDPR) and the terms of use under Dutch law. Opened from the Info page, the
 * desktop landing's footer and the consent card of another site's video; × in the header goes back to Info.
 * The text is the app's (`privacy` translations), the same for every experience. A draft from what the code does –
 * Building Fictions checks it before release.
 */
export class PrivacyPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      .section-title:first-of-type { margin-top: 0; }
      h3 { margin: 1.25rem 0 .25rem; font-size: var(--text-size); font-weight: 600; }
      p { overflow-wrap: anywhere; }
      .changed { color: var(--color-muted); font-size: var(--text-size-small); }
    `;
  }

  get template(): string {
    const experience = getExperience();
    const email = `<a href="mailto:${PUBLISHER.email}">${PUBLISHER.email}</a>`;
    const changed = new Date(`${PRIVACY_CHANGED}T12:00:00Z`).toLocaleDateString(t("privacy:locale"), { year: "numeric", month: "long", day: "numeric" });
    const part = (title: string, text: string) => `<h3>${title}</h3><p>${text}</p>`;
    return /* html */ `
      <div class="content">
        <h2 class="section-title">${t("privacy:whoTitle")}</h2>
        <p>${escapeHtml(PUBLISHER.name)}, ${escapeHtml(PUBLISHER.address)} · KvK ${PUBLISHER.kvk} · ${email}</p>
        <p>${t("privacy:intro", { title: escapeHtml(experience.title) })}</p>

        <h2 class="section-title">${t("privacy:privacyTitle")}</h2>
        ${part(t("privacy:trackingTitle"), t("privacy:tracking"))}
        ${part(t("privacy:deviceTitle"), t("privacy:device"))}
        ${part(t("privacy:accountTitle"), t("privacy:account"))}
        ${part(t("privacy:processorsTitle"), t("privacy:processors"))}
        ${part(t("privacy:videosTitle"), t("privacy:videos"))}
        ${part(t("privacy:retentionTitle"), t("privacy:retention"))}
        ${part(t("privacy:rightsTitle"), t("privacy:rights", { email }))}

        <h2 class="section-title">${t("privacy:termsTitle")}</h2>
        <p>${t("privacy:terms1", { author: escapeHtml(experience.book?.author ?? "") })}</p>
        <p>${t("privacy:terms2")}</p>
        <p>${t("privacy:terms3")}</p>
        <p>${t("privacy:terms4")}</p>

        <h2 class="section-title">${t("privacy:lawTitle")}</h2>
        <p>${t("privacy:law")}</p>
        <p class="changed">${t("privacy:changed", { date: changed })}</p>
      </div>
    `;
  }

  protected update(): void {
    // Static page: the text changes only with the app
  }
}

customElements.define("privacy-page", PrivacyPage);
