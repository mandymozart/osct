import { goldButton } from "@/components/buttons";
import { t } from "i18next";
import { InstallService } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * PWA install section. The button stays until the app runs installed, because browsers offer their install
 * dialog only once and can't always detect an installed app. A tap opens the native dialog when available,
 * otherwise shows manual steps (iOS: Share → "Add to Home Screen"; others: the browser menu). When running
 * installed, it shows a status line instead.
 */
export class SettingsInstall extends SettingsSection {
  private install = InstallService.getInstance();
  private unsubscribe?: () => void;
  /** Set when the button was tapped without a native dialog available: show the manual steps */
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
