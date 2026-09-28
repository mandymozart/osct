import { GoldSwitch } from "@/components/buttons";
import { t } from "i18next";
import { FeedbackService, FeedbackSettings } from "@/services";
import { escapeHtml } from "@/utils";
import { SettingsSection } from "./settings-section";

/**
 * Sound & vibration section: one `<gold-switch>` each for sounds and haptics. `FeedbackService` stores the
 * choice on this device; enabling one plays a tap sample.
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
        /* Aligns the first row's text (not its 4rem box) with where other sections' text starts */
        gold-switch:first-of-type { margin-top: calc((var(--text-size) * var(--text-line) - 4rem) / 2); }
      </style>
      ${toggle("sound", t("settings:soundLabel"))}
      ${toggle("haptics", t("settings:hapticsLabel"))}
      <p class="description">${t("settings:feedbackDescription")}</p>
    `;
  }

  protected onAction(): void {
    // No buttons; switches are handled in handleSwitch
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
