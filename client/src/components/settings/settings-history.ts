import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { SettingsSection } from "./settings-section";

/**
 * History section – the reader's save game for this book on this device: "Reset book" deletes the
 * progress (after a confirmation). Settings such as the language are kept.
 */
export class SettingsHistory extends SettingsSection {
  private done = false;

  protected content(): string {
    return /* html */ `
      <div class="row">${goldButton({ label: i18next.t("settings:historyButton"), attrs: { "data-action": "reset" } })}</div>
      <p class="description" role="status">${i18next.t(this.done ? "settings:historyDone" : "settings:historyDescription")}</p>
    `;
  }

  protected onAction(action: string): void {
    if (action !== "reset" || !window.confirm(i18next.t("settings:historyConfirm"))) return;
    this.game.history.reset();
    this.done = true;
    this.render();
  }
}

customElements.define("settings-history", SettingsHistory);
