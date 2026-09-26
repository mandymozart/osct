import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { SettingsSection } from "./settings-section";

/** Tutorial section: starts the onboarding again */
export class SettingsTutorial extends SettingsSection {
  protected content(): string {
    return /* html */ `
      <div class="row">${goldButton({ label: i18next.t("settings:tutorialButton"), attrs: { "data-action": "tutorial" } })}</div>
      <p class="description">${i18next.t("settings:tutorialDescription")}</p>
    `;
  }

  protected onAction(action: string): void {
    if (action === "tutorial") this.game.router.navigate("/tutorial", { key: "step", value: "0" });
  }
}

customElements.define("settings-tutorial", SettingsTutorial);
