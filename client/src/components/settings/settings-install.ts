import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { InstallService } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * Home screen section (PWA): installs the app where the browser can (its own dialog), explains Safari's
 * Share → "Add to Home Screen" on iOS, and says so when the app already runs from the home screen.
 */
export class SettingsInstall extends SettingsSection {
  private install = InstallService.getInstance();
  private unsubscribe?: () => void;

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
    const button = method === "prompt"
      ? `<div class="row">${goldButton({ label: i18next.t("settings:installButton"), attrs: { "data-action": "install" } })}</div>`
      : `<div class="row"><span class="muted">${i18next.t("settings:installLabel")}</span></div>`;
    const description = method === "installed" ? i18next.t("settings:installDone")
      : method === "prompt" ? i18next.t("settings:installDescription")
      : method === "ios" ? i18next.t("settings:installIos")
      : i18next.t("settings:installManual");
    return /* html */ `
      ${button}
      <p class="description" role="status">${description}</p>
    `;
  }

  protected onAction(action: string): void {
    if (action === "install") void this.install.prompt();
  }
}

customElements.define("settings-install", SettingsInstall);
