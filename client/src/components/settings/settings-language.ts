import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { DEFAULT_LANGUAGE, isLanguage, Language, LANGUAGE_NAMES, LANGUAGES } from "@/i18n";
import { SettingsSection } from "./settings-section";

/**
 * Language section: "Language: English" + "Change language" → the languages, each named in itself.
 * `i18next.changeLanguage` stores the choice (language detector → localStorage) and the app reloads – the
 * URL keeps the view.
 */
export class SettingsLanguage extends SettingsSection {
  private open = false;

  private get current(): Language {
    return isLanguage(i18next.resolvedLanguage) ? i18next.resolvedLanguage : DEFAULT_LANGUAGE;
  }

  protected content(): string {
    const current = this.current;
    const options = LANGUAGES.map(language =>
      goldButton({
        label: LANGUAGE_NAMES[language],
        attrs: { "data-action": "choose", "data-language": language, lang: language, "aria-current": String(language === current) },
      }),
    ).join("");
    return /* html */ `
      <div class="row">
        <span class="muted">${i18next.t("settings:languageLabel")}</span>
        <span>${LANGUAGE_NAMES[current]}</span>
        ${goldButton({ label: i18next.t("settings:languageChange"), attrs: { "data-action": "toggle", "aria-expanded": String(this.open) } })}
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
      if (language === this.current) {
        this.open = false;
        this.render();
        return;
      }
      void i18next.changeLanguage(language).then(() => window.location.reload());
    }
  }
}

customElements.define("settings-language", SettingsLanguage);
