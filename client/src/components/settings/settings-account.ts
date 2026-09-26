import { goldButton } from "@/components/buttons";
import i18next from "i18next";
import { AccountService } from "@/services";
import { AccountNotice, AccountOption, AccountOptions, AccountSnapshot } from "@/types";
import { escapeHtml } from "@/utils";
import { getBook } from "@/utils/game-config";
import { SettingsSection } from "./settings-section";

const OPTIONS: AccountOption[] = ["saveProgress", "bookUpdates", "publisherUpdates"];

/**
 * Account section (branch `database`): sign in with an email – no password. Signed out: the email and the
 * three options (all on by default) → "Send email". Then: the code from the email (the link in it signs
 * in as well). Signed in: the address, the options as toggles, sign out, delete the account.
 * Hidden when the build has no accounts API (`VITE_API_URL`).
 */
export class SettingsAccount extends SettingsSection {
  private account = AccountService.getInstance();
  private unsubscribe?: () => void;
  /** The form's values survive re-renders */
  private email = "";
  private code = "";
  private choices: AccountOptions = { saveProgress: true, bookUpdates: true, publisherUpdates: true };

  connectedCallback() {
    if (!this.account.isEnabled()) this.style.display = "none";
    super.connectedCallback();
    this.unsubscribe = this.account.subscribe(() => this.render());
    this.shadowRoot?.addEventListener("submit", this.handleSubmit);
    this.shadowRoot?.addEventListener("input", this.handleInput);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.shadowRoot?.removeEventListener("submit", this.handleSubmit);
    this.shadowRoot?.removeEventListener("input", this.handleInput);
    this.account.clearNotice();
  }

  protected content(): string {
    if (!this.account.isEnabled()) return "";
    const snapshot = this.account.getSnapshot();
    const body = snapshot.status === "signed-in" ? this.signedIn(snapshot)
      : snapshot.status === "pending" ? this.pending(snapshot)
      : this.signedOut(snapshot);
    return /* html */ `
      <style>
        form { display: flex; flex-wrap: wrap; gap: .6rem .75rem; align-items: center; }
        form .field { flex: 1 1 12rem; }
        form .code { flex: 0 1 8rem; letter-spacing: .3em; }
        .options { margin-top: .6rem; }
        .notice { margin: .6rem 0 0; }
      </style>
      ${body}
      ${this.notice(snapshot.notice)}
    `;
  }

  private signedOut({ busy }: AccountSnapshot): string {
    return /* html */ `
      <div class="row"><span class="muted">${i18next.t("account:label")}</span></div>
      <p class="description">${i18next.t("account:signedOutDescription")}</p>
      <div class="options" role="group" aria-label="${escapeHtml(i18next.t("account:optionsLabel"))}">
        ${OPTIONS.map(option => this.toggle(option, this.choices[option], "choose", busy)).join("")}
      </div>
      <form class="options" data-form="email">
        <input class="field design" type="email" name="email" required autocomplete="email" inputmode="email"
          value="${escapeHtml(this.email)}" placeholder="${escapeHtml(i18next.t("account:emailPlaceholder"))}"
          aria-label="${escapeHtml(i18next.t("account:emailPlaceholder"))}" ${busy ? "disabled" : ""}>
        ${goldButton({ label: i18next.t("account:send"), primary: true, type: "submit", attrs: { disabled: busy } })}
      </form>
    `;
  }

  private pending({ pending, busy }: AccountSnapshot): string {
    return /* html */ `
      <div class="row"><span class="muted">${i18next.t("account:label")}</span></div>
      <p class="description" role="status">${i18next.t("account:pendingDescription", { email: pending?.email ?? "" })}</p>
      <form class="options" data-form="code">
        <input class="field design code" type="text" name="code" required autocomplete="one-time-code" inputmode="numeric"
          pattern="[0-9 ]{6,7}" maxlength="7" value="${escapeHtml(this.code)}"
          placeholder="000000" aria-label="${escapeHtml(i18next.t("account:codeLabel"))}" ${busy ? "disabled" : ""}>
        ${goldButton({ label: i18next.t("account:confirm"), primary: true, type: "submit", attrs: { disabled: busy } })}
      </form>
      <div class="row options">
        ${goldButton({ label: i18next.t("account:sendAgain"), attrs: { "data-action": "send-again", disabled: busy } })}
        ${goldButton({ label: i18next.t("account:otherEmail"), attrs: { "data-action": "other-email", disabled: busy } })}
      </div>
    `;
  }

  private signedIn({ account, sync, busy }: AccountSnapshot): string {
    if (!account) return "";
    const syncText = sync === "synced" ? "account:syncSynced"
      : sync === "syncing" ? "account:syncSyncing"
      : sync === "pending" ? "account:syncPending"
      : "account:syncOff";
    return /* html */ `
      <div class="row">
        <span class="muted">${i18next.t("account:label")}</span>
        <span>${escapeHtml(account.email)}</span>
      </div>
      <div class="options" role="group" aria-label="${escapeHtml(i18next.t("account:optionsLabel"))}">
        ${OPTIONS.map(option => this.toggle(option, account.options[option], "toggle", busy)).join("")}
      </div>
      <p class="description" role="status">${i18next.t(syncText)}</p>
      <div class="row options">
        ${goldButton({ label: i18next.t("account:signOut"), attrs: { "data-action": "sign-out", disabled: busy } })}
        ${goldButton({ label: i18next.t("account:delete"), attrs: { "data-action": "delete", disabled: busy } })}
      </div>
    `;
  }

  private toggle(option: AccountOption, on: boolean, action: string, busy: boolean): string {
    const labels: Record<AccountOption, string> = {
      saveProgress: i18next.t("account:saveProgress"),
      // goldButton escapes the label – no second escape by i18next
      bookUpdates: i18next.t("account:bookUpdates", { title: getBook().title, interpolation: { escapeValue: false } }),
      publisherUpdates: i18next.t("account:publisherUpdates"),
    };
    return goldButton({
      label: `${labels[option]}: ${i18next.t(on ? "settings:on" : "settings:off")}`,
      attrs: { "data-action": action, "data-option": option, "aria-pressed": String(on), disabled: busy },
    });
  }

  private notice(notice: AccountNotice | null): string {
    if (!notice) return "";
    const text = typeof notice === "string"
      ? i18next.t(notice === "confirmed" ? "account:confirmed" : notice === "deleted" ? "account:deleted" : "account:signedOut")
      : i18next.t(`account:errors.${notice.error}`, { defaultValue: i18next.t("account:errors.server-error") });
    return `<p class="description notice" role="${typeof notice === "string" ? "status" : "alert"}">${text}</p>`;
  }

  protected onAction(action: string, element: HTMLElement): void {
    const option = element.dataset.option as AccountOption | undefined;
    if (action === "choose" && option) {
      this.choices = { ...this.choices, [option]: !this.choices[option] };
      this.render();
    } else if (action === "toggle" && option) {
      const account = this.account.getSnapshot().account;
      if (account) void this.account.setOption(option, !account.options[option]);
    } else if (action === "send-again") {
      const pending = this.account.getSnapshot().pending;
      if (pending) void this.account.requestLogin(pending.email, this.choices);
    } else if (action === "other-email") {
      this.code = "";
      this.account.cancelPending();
    } else if (action === "sign-out") {
      void this.account.signOut();
    } else if (action === "delete") {
      if (window.confirm(i18next.t("account:deleteConfirm"))) void this.account.deleteAccount();
    }
  }

  private handleInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === "email") this.email = input.value;
    if (input.name === "code") this.code = input.value;
  };

  private handleSubmit = (event: Event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (form.dataset.form === "email") {
      void this.account.requestLogin(this.email, this.choices).then(sent => {
        if (sent) this.code = "";
      });
    } else if (form.dataset.form === "code") {
      void this.account.confirmCode(this.code).then(done => {
        if (done) this.code = "";
      });
    }
  };
}

customElements.define("settings-account", SettingsAccount);
