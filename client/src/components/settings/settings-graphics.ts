import { GoldSwitch } from "@/components/buttons";
import { t } from "i18next";
import { GraphicsService, GraphicsSettings } from "@/services";
import { escapeHtml } from "@/utils";
import { SettingsSection } from "./settings-section";

const SETTINGS: readonly (keyof GraphicsSettings)[] = ["onionSky", "surroundings"];

/**
 * Graphics section: one `<gold-switch>` each for the onion sky and the scene around the book. `GraphicsService`
 * stores the choice on this device; the scan view follows at once.
 */
export class SettingsGraphics extends SettingsSection {
  private graphics = GraphicsService.getInstance();

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot?.addEventListener("change", this.handleSwitch);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.shadowRoot?.removeEventListener("change", this.handleSwitch);
  }

  protected content(): string {
    const settings = this.graphics.getSettings();
    const toggle = (setting: keyof GraphicsSettings, label: string) =>
      `<gold-switch label="${escapeHtml(label)}" data-setting="${setting}"${settings[setting] ? " checked" : ""}></gold-switch>`;
    return /* html */ `
      ${toggle("onionSky", t("settings:onionSkyLabel"))}
      ${toggle("surroundings", t("settings:surroundingsLabel"))}
      <p class="description">${t("settings:graphicsDescription")}</p>
    `;
  }

  protected onAction(): void {
    // No buttons; switches are handled in handleSwitch
  }

  private handleSwitch = (event: Event) => {
    const element = event.target;
    if (!(element instanceof GoldSwitch)) return;
    const setting = element.dataset.setting as keyof GraphicsSettings | undefined;
    if (!setting || !SETTINGS.includes(setting)) return;
    this.graphics.setSettings({ [setting]: element.checked });
  };
}

customElements.define("settings-graphics", SettingsGraphics);
