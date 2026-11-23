import { goldButton } from "@/components/buttons";
import { t } from "i18next";
import { EmbedConsentService } from "@/services";
import { escapeHtml } from "@/utils";
import { SettingsSection } from "./settings-section";

/** The providers that are always listed; a site's host is listed once the reader allowed it */
const KNOWN: ReadonlyArray<{ id: string; name: string }> = [
  { id: "youtube", name: "YouTube" },
  { id: "vimeo", name: "Vimeo" },
];

/**
 * Videos and pages from other sites (#351): what a Links entry's YouTube / Vimeo player or embedded page does before
 * it loads – YouTube and Vimeo always, every other site the reader chose "Always" for –, each with "Asks first" or
 * "Loads without asking" and, when allowed, "Ask again" (`EmbedConsentService`, this device only).
 */
export class SettingsEmbeds extends SettingsSection {
  private consent = EmbedConsentService.getInstance();
  private unsubscribe: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = this.consent.subscribe(() => this.render());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  protected content(): string {
    const sites = this.consent.list().filter(id => !KNOWN.some(known => known.id === id)).map(id => ({ id, name: id }));
    const rows = [...KNOWN, ...sites]
      .map(({ id, name }) => {
        const allowed = this.consent.isAllowed(id);
        return /* html */ `
          <div class="row provider">
            <span>${escapeHtml(name)}</span>
            <span class="muted">${t(allowed ? "settings:embedsAllowed" : "settings:embedsAsk")}</span>
            ${allowed ? goldButton({ label: t("settings:embedsAskAgain"), attrs: { "data-action": "revoke", "data-provider": id } }) : ""}
          </div>`;
      })
      .join("");
    return /* html */ `
      <style>
        .provider { margin-top: .5rem; }
        .provider > span:first-child { min-width: 5rem; }
      </style>
      <p class="description first">${t("settings:embedsLabel")}</p>
      ${rows}
      <p class="description">${t("settings:embedsDescription")}</p>
    `;
  }

  protected onAction(action: string, element: HTMLElement): void {
    if (action === "revoke" && element.dataset.provider) this.consent.revoke(element.dataset.provider);
  }
}

customElements.define("settings-embeds", SettingsEmbeds);
