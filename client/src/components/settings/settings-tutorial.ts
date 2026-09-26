import { goldButton } from "@/components/buttons";
import { t, tHtml } from "@/i18n";
import { SettingsSection } from "./settings-section";

/** Tutorial section: starts the onboarding again */
export class SettingsTutorial extends SettingsSection {
  protected content(): string {
    return /* html */ `
      <div class="row">${goldButton({ label: t("settings.tutorialButton"), attrs: { "data-action": "tutorial" } })}</div>
      <p class="description">${tHtml("settings.tutorialDescription")}</p>
    `;
  }

  protected onAction(action: string): void {
    if (action === "tutorial") this.game.router.navigate("/tutorial", { key: "step", value: "0" });
  }
}

customElements.define("settings-tutorial", SettingsTutorial);
