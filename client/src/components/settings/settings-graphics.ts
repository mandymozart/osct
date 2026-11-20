import { goldButton, GoldSwitch } from "@/components/buttons";
import { t } from "i18next";
import { GraphicsService, type GraphicsSettings, isMediaQuality, isTextureQuality, MEDIA_QUALITIES, type MediaQuality, TEXTURE_QUALITIES, type TextureQuality } from "@/services";
import { escapeHtml } from "@/utils";
import { SettingsSection } from "./settings-section";

type SwitchSetting = "onionSky" | "surroundings";
const SETTINGS: readonly SwitchSetting[] = ["onionSky", "surroundings"];

/** Each choice's name (literal keys: the i18n extraction finds them) */
const qualityLabel = (quality: TextureQuality): string => ({
  auto: () => t("settings:textureQualityAuto"),
  512: () => t("settings:textureQualityLow"),
  1024: () => t("settings:textureQualityMedium"),
  2048: () => t("settings:textureQualityHigh"),
  4096: () => t("settings:textureQualityBest"),
})[quality]();

/** The media quality's choices (#331) – the same words as the model detail's */
const mediaLabel = (quality: MediaQuality): string => ({
  auto: () => t("settings:textureQualityAuto"),
  low: () => t("settings:textureQualityLow"),
  medium: () => t("settings:textureQualityMedium"),
  high: () => t("settings:textureQualityHigh"),
})[quality]();

/**
 * Graphics section: one `<gold-switch>` each for the onion sky and the scene around the surfaces, and the texture
 * quality of the models (#260) and the media quality of pictures, videos and sounds with levels (#331) – each the current
 * choice and a toggle that lists the choices, like the language.
 * `GraphicsService` stores the choice on this device; the scan view follows at once.
 */
export class SettingsGraphics extends SettingsSection {
  private graphics = GraphicsService.getInstance();
  /** Which choice list is open */
  private open: "texture" | "media" | null = null;

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
    const quality = settings.textureQuality ?? "auto";
    const options = TEXTURE_QUALITIES.map(choice =>
      goldButton({ label: qualityLabel(choice), attrs: { "data-action": "choose", "data-quality": String(choice), "aria-current": String(choice === quality) } }),
    ).join("");
    const media = settings.mediaQuality ?? "auto";
    const mediaOptions = MEDIA_QUALITIES.map(choice =>
      goldButton({ label: mediaLabel(choice), attrs: { "data-action": "choose-media", "data-quality": choice, "aria-current": String(choice === media) } }),
    ).join("");
    const toggle = (setting: SwitchSetting, label: string) =>
      `<gold-switch label="${escapeHtml(label)}" data-setting="${setting}"${settings[setting] ? " checked" : ""}></gold-switch>`;
    return /* html */ `
      ${toggle("onionSky", t("settings:onionSkyLabel"))}
      ${toggle("surroundings", t("settings:surroundingsLabel"))}
      <p class="description">${t("settings:graphicsDescription")}</p>
      <div class="row">
        <span class="muted">${t("settings:textureQualityLabel")}</span>
        <span>${qualityLabel(quality)}</span>
        ${goldButton({ label: t("settings:textureQualityChange"), attrs: { "data-action": "toggle", "aria-expanded": String(this.open === "texture") } })}
      </div>
      ${this.open === "texture" ? `<div class="options" role="group">${options}</div>` : ""}
      <p class="description">${t("settings:textureQualityDescription")}</p>
      <div class="row">
        <span class="muted">${t("settings:mediaQualityLabel")}</span>
        <span>${mediaLabel(media)}</span>
        ${goldButton({ label: t("settings:textureQualityChange"), attrs: { "data-action": "toggle-media", "aria-expanded": String(this.open === "media") } })}
      </div>
      ${this.open === "media" ? `<div class="options" role="group">${mediaOptions}</div>` : ""}
      <p class="description">${t("settings:mediaQualityDescription")}</p>
    `;
  }

  /** The texture and media quality's buttons; the switches are handled in handleSwitch */
  protected onAction(action: string, element: HTMLElement): void {
    if (action === "toggle") this.open = this.open === "texture" ? null : "texture";
    else if (action === "toggle-media") this.open = this.open === "media" ? null : "media";
    else if (action === "choose-media") {
      const quality = element.dataset.quality;
      if (!isMediaQuality(quality)) return;
      this.graphics.setSettings({ mediaQuality: quality });
      this.open = null;
    } else if (action === "choose") {
      const raw = element.dataset.quality;
      const quality = raw === "auto" ? raw : Number(raw);
      if (!isTextureQuality(quality)) return;
      this.graphics.setSettings({ textureQuality: quality });
      this.open = null;
    } else return;
    this.render();
  }

  private handleSwitch = (event: Event) => {
    const element = event.target;
    if (!(element instanceof GoldSwitch)) return;
    const setting = element.dataset.setting as SwitchSetting | undefined;
    if (!setting || !SETTINGS.includes(setting)) return;
    this.graphics.setSettings({ [setting]: element.checked });
  };
}

customElements.define("settings-graphics", SettingsGraphics);
