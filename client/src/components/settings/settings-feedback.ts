import { GoldSwitch } from "@/components/buttons";
import i18next from "i18next";
import { FeedbackService, FeedbackSettings } from "@/services";
import { escapeHtml } from "@/utils";
import { SettingsSection } from "./settings-section";

/**
 * Sound & vibration section: sounds and vibration each on / off as `<gold-switch>` (Tilman 2026-09-27 – like
 * the account options); FeedbackService keeps the choice on this device. Turning one on plays a sample.
 */
export class SettingsFeedback extends SettingsSection {
  private feedback = FeedbackService.getInstance();

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot?.addEventListener("change", this.handleSwitch);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.shadowRoot?.removeEventListener("change", this.handleSwitch);
  }

  protected content(): string {
    const settings = this.feedback.getSettings();
    const toggle = (setting: keyof FeedbackSettings, label: string) =>
      `<gold-switch label="${escapeHtml(label)}" data-setting="${setting}" data-feedback="none"${settings[setting] ? " checked" : ""}></gold-switch>`;
    return /* html */ `
      <style>
        /* The first row starts the section: its text (not its 4rem box) sits where other sections' text starts */
        gold-switch:first-of-type { margin-top: calc((var(--text-size) * var(--text-line) - 4rem) / 2); }
      </style>
      ${toggle("sound", i18next.t("settings:soundLabel"))}
      ${toggle("haptics", i18next.t("settings:hapticsLabel"))}
      <p class="description">${i18next.t("settings:feedbackDescription")}</p>
    `;
  }

  protected onAction(): void {
    // Only switches here (handleSwitch)
  }

  private handleSwitch = (event: Event) => {
    const element = event.target;
    if (!(element instanceof GoldSwitch)) return;
    const setting = element.dataset.setting;
    if (setting !== "sound" && setting !== "haptics") return;
    this.feedback.setSettings({ [setting]: element.checked });
    if (element.checked) this.feedback.play("tap");
  };
}

customElements.define("settings-feedback", SettingsFeedback);
