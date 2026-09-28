import { goldButton } from "@/components/buttons";
import { t } from "i18next";
import { UserService } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * Progress section (Info page, first in the group "Account" – Tilman 2026-09-27): explains the progress (the
 * entries found and explored) and "Reset progress" deletes it (after a confirmation). Signed in, the reset reaches the account too
 * (UserService sends it like any other change). Settings such as the language are kept.
 */
export class SettingsHistory extends SettingsSection {
  private user = UserService.getInstance();
  private unsubscribe?: () => void;
  private done = false;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = this.user.subscribe(() => this.render());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  private get signedIn(): boolean {
    return this.user.getSnapshot().status === "signed-in";
  }

  protected content(): string {
    const description = this.done ? "settings:historyDone"
      : this.signedIn ? "settings:historyDescriptionAccount"
      // Without an accounts API (VITE_API_URL) the account section is hidden – don't point to it
      : this.user.isEnabled() ? "settings:historyDescription"
      : "settings:historyDescriptionLocal";
    return /* html */ `
      <style>.explain { margin: 0 0 .6rem; }</style>
      <p class="explain" role="status">${t(description)}</p>
      <div class="row">${goldButton({ label: t("settings:historyButton"), attrs: { "data-action": "reset" } })}</div>
    `;
  }

  protected onAction(action: string): void {
    const confirm = this.signedIn ? "settings:historyConfirmAccount" : "settings:historyConfirm";
    if (action !== "reset" || !window.confirm(t(confirm))) return;
    this.game.history.reset();
    this.done = true;
    this.render();
  }
}

customElements.define("settings-history", SettingsHistory);
