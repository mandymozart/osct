import { goldButton } from "@/components/buttons";
import { t } from "i18next";
import { InstallService } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * Install section (PWA, Tilman 2026-09-27): "Install as app on this device" stays until the app is installed
 * – browsers offer their own install dialog only once, and can't always tell whether the app is installed.
 * A tap opens the browser's dialog where there is one, else it explains the steps (iOS: Share → "Add to
 * Home Screen"; other browsers: their menu). Running from the home screen, it says so instead.
 */
export class SettingsInstall extends SettingsSection {
  private install = InstallService.getInstance();
  private unsubscribe?: () => void;
  /** The reader tapped the button and no dialog was available – show the steps */
  private explain = false;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = this.install.subscribe(() => this.render());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  protected content(): string {
    const method = this.install.getMethod();
    if (method === "installed" || method === "added") {
      return /* html */ `<p class="description first" role="status">${t(method === "installed" ? "settings:installDone" : "settings:installAdded")}</p>`;
    }
    const steps = method === "ios" ? t("settings:installIos") : t("settings:installManual");
    return /* html */ `
      <div class="row">${goldButton({ label: t("settings:installButton"), attrs: { "data-action": "install" } })}</div>
      <p class="description" role="status">${this.explain ? steps : t("settings:installDescription")}</p>
    `;
  }

  protected onAction(action: string): void {
    if (action !== "install") return;
    if (this.install.getMethod() === "prompt") {
      void this.install.prompt();
    } else {
      this.explain = true;
      this.render();
    }
  }
}

customElements.define("settings-install", SettingsInstall);
