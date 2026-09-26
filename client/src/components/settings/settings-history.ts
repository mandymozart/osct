import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { UserService } from "@/services";
import { SettingsSection } from "./settings-section";

/**
 * Reset section (Info page, group "Account" – Tilman 2026-09-27) – the reader's save game for this book:
 * "Reset book" deletes the progress (after a confirmation). Signed in, the reset reaches the account too
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
      : "settings:historyDescription";
    return /* html */ `
      <div class="row">${goldButton({ label: i18next.t("settings:historyButton"), attrs: { "data-action": "reset" } })}</div>
      <p class="description" role="status">${i18next.t(description)}</p>
    `;
  }

  protected onAction(action: string): void {
    const confirm = this.signedIn ? "settings:historyConfirmAccount" : "settings:historyConfirm";
    if (action !== "reset" || !window.confirm(i18next.t(confirm))) return;
    this.game.history.reset();
    this.done = true;
    this.render();
  }
}

customElements.define("settings-history", SettingsHistory);
