import { goldButton } from "@/components/buttons";
import { getLanguage, isLanguage, LANGUAGE_NAMES, LANGUAGES, t, tHtml } from "@/i18n";
import { SettingsService } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * Language section: "Language: English" + "Change language" → the languages, each named in itself.
 * The choice is stored in the settings (`SettingsService`) and the app reloads – the URL keeps the view.
 */
export class SettingsLanguage extends SettingsSection {
  private open = false;

  protected content(): string {
    const current = getLanguage();
    const options = LANGUAGES.map(language =>
      goldButton({
        label: LANGUAGE_NAMES[language],
        attrs: { "data-action": "choose", "data-language": language, lang: language, "aria-current": String(language === current) },
      }),
    ).join("");
    return /* html */ `
      <div class="row">
        <span class="muted">${tHtml("settings.languageLabel")}</span>
        <span>${LANGUAGE_NAMES[current]}</span>
        ${goldButton({ label: t("settings.languageChange"), attrs: { "data-action": "toggle", "aria-expanded": String(this.open) } })}
      </div>
      ${this.open ? `<div class="options" role="group">${options}</div>` : ""}
    `;
  }

  protected onAction(action: string, element: HTMLElement): void {
    if (action === "toggle") {
      this.open = !this.open;
      this.render();
    } else if (action === "choose") {
      const language = element.dataset.language;
      if (!isLanguage(language)) return;
      if (language === getLanguage()) {
        this.open = false;
        this.render();
        return;
      }
      SettingsService.getInstance().setLanguage(language);
      window.location.reload();
    }
  }
}

customElements.define("settings-language", SettingsLanguage);
