import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { FeedbackService, FeedbackSettings } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * Sound & vibration section: sounds and vibration each on / off (FeedbackService keeps the choice on
 * this device). Turning one on plays a sample right away.
 */
export class SettingsFeedback extends SettingsSection {
  private feedback = FeedbackService.getInstance();

  protected content(): string {
    const settings = this.feedback.getSettings();
    const toggle = (setting: keyof FeedbackSettings, label: string) =>
      goldButton({
        label: `${label}: ${i18next.t(settings[setting] ? "settings:on" : "settings:off")}`,
        attrs: { "data-action": "toggle", "data-setting": setting, "aria-pressed": String(settings[setting]), "data-feedback": "none" },
      });
    return /* html */ `
      <div class="row">
        ${toggle("sound", i18next.t("settings:soundLabel"))}
        ${toggle("haptics", i18next.t("settings:hapticsLabel"))}
      </div>
      <p class="description">${i18next.t("settings:feedbackDescription")}</p>
    `;
  }

  protected onAction(action: string, element: HTMLElement): void {
    const setting = element.dataset.setting;
    if (action !== "toggle" || (setting !== "sound" && setting !== "haptics")) return;
    const on = !this.feedback.getSettings()[setting];
    this.feedback.setSettings({ [setting]: on });
    if (on) this.feedback.play("tap");
    this.render();
  }
}

customElements.define("settings-feedback", SettingsFeedback);
