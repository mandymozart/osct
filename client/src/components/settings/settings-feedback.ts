import { GoldSwitch } from "@/components/buttons";
import { t } from "i18next";
import { FeedbackService, type FeedbackSettings, SubtitleService } from "@/services";
import { escapeHtml } from "@/utils";
import { SettingsSection } from "./settings-section";

/**
 * Sound & vibration section: one `<gold-switch>` each for sounds and haptics. `FeedbackService` stores the
 * choice on this device; enabling one plays a tap sample. Below them the switch for the subtitles of speaking videos
 * (`SubtitleService`, on until turned off).
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
        /* Places the first row's text (not its 4rem box) 2rem below the title, like the gap between the rows */
        gold-switch:first-of-type { margin-top: calc((var(--text-size) * var(--text-line) - 4rem) / 2 + 1rem); }
      </style>
      ${toggle("sound", t("settings:soundLabel"))}
      ${toggle("haptics", t("settings:hapticsLabel"))}
      <p class="description">${t("settings:feedbackDescription")}</p>
      <gold-switch label="${escapeHtml(t("settings:subtitlesLabel"))}" data-setting="subtitles" data-feedback="none"${SubtitleService.getInstance().getSettings().enabled ? " checked" : ""}></gold-switch>
      <p class="description">${t("settings:subtitlesDescription")}</p>
    `;
  }

  protected onAction(): void {
    // No buttons; switches are handled in handleSwitch
  }

  private handleSwitch = (event: Event) => {
    const element = event.target;
    if (!(element instanceof GoldSwitch)) return;
    const setting = element.dataset.setting;
    if (setting === "subtitles") return SubtitleService.getInstance().setSettings({ enabled: element.checked });
    if (setting !== "sound" && setting !== "haptics") return;
    this.feedback.setSettings({ [setting]: element.checked });
    if (element.checked) this.feedback.play("tap");
  };
}

customElements.define("settings-feedback", SettingsFeedback);
