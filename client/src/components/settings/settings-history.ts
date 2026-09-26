import { goldButton } from "@/components/buttons";
import { t, tHtml } from "@/i18n";
import { SettingsSection } from "./settings-section";

/**
 * History section – the reader's save game for this book on this device: "Reset book" deletes the
 * progress (after a confirmation). Settings such as the language are kept.
 */
export class SettingsHistory extends SettingsSection {
  private done = false;

  protected content(): string {
    return /* html */ `
      <div class="row">${goldButton({ label: t("settings.historyButton"), attrs: { "data-action": "reset" } })}</div>
      <p class="description" role="status">${tHtml(this.done ? "settings.historyDone" : "settings.historyDescription")}</p>
    `;
  }

  protected onAction(action: string): void {
    if (action !== "reset" || !window.confirm(t("settings.historyConfirm"))) return;
    this.game.history.reset();
    this.done = true;
    this.render();
  }
}

customElements.define("settings-history", SettingsHistory);
