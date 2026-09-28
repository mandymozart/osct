import { goldButton, GoldSwitch } from "@/components/buttons";
import { t } from "i18next";
import { UserService } from "@/services";
import { UserData, UserNotice, UserOption, UserOptions, UserSnapshot } from "@/types";
import { escapeHtml } from "@/utils";
import { getBook } from "@/utils/game-config";
import { SettingsSection } from "./settings-section";

const OPTIONS: UserOption[] = ["bookUpdates", "artistUpdates", "publisherUpdates"];

/**
 * Account section: passwordless sign-in by email (magic link or 6-digit code), update opt-ins as
 * `<gold-switch>`, progress sync status, sign-out and deletion. Renders from `UserService` snapshots
 * (signed-out / pending / signed-in). Update options are opt-in: off until the reader enables them.
 * Removed when no accounts API (`VITE_API_URL`) is configured.
 */
export class SettingsAccount extends SettingsSection {
  private user = UserService.getInstance();
  private unsubscribe?: () => void;
  /** Form values, kept across re-renders */
  private email = "";
  private code = "";
  /** Update options chosen in the sign-up form; sent with the login request */
  private choices: UserOptions = { bookUpdates: false, artistUpdates: false, publisherUpdates: false };

  connectedCallback() {
    // Removed rather than hidden: an empty section would still draw its separator rule
    if (!this.user.isEnabled()) {
      this.remove();
      return;
    }
    super.connectedCallback();
    this.unsubscribe = this.user.subscribe(() => this.render());
    this.shadowRoot?.addEventListener("submit", this.handleSubmit);
    this.shadowRoot?.addEventListener("input", this.handleInput);
    this.shadowRoot?.addEventListener("change", this.handleSwitch);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.shadowRoot?.removeEventListener("submit", this.handleSubmit);
    this.shadowRoot?.removeEventListener("input", this.handleInput);
    this.shadowRoot?.removeEventListener("change", this.handleSwitch);
    this.user.clearNotice();
  }

  protected content(): string {
    if (!this.user.isEnabled()) return "";
    const snapshot = this.user.getSnapshot();
    const body = snapshot.status === "signed-in" && snapshot.user ? this.signedIn(snapshot.user, snapshot)
      : snapshot.status === "pending" ? this.pending(snapshot)
      : this.signedOut(snapshot);
    return /* html */ `
      <style>
        form { display: flex; flex-wrap: wrap; gap: .6rem .75rem; align-items: center; }
        form .field { flex: 1 1 12rem; }
        form .code { flex: 0 1 8rem; letter-spacing: .3em; }
        .options { margin-top: .6rem; }
        .switches { display: flex; flex-direction: column; margin-top: .6rem; }
        .first { margin-top: 0; }
        .notice { margin: .6rem 0 0; }
      </style>
      ${body}
      ${this.notice(snapshot.notice)}
    `;
  }

  private signedOut({ busy }: UserSnapshot): string {
    return /* html */ `
      <p class="first">${t("account:signedOutDescription")}</p>
      <form class="options" data-form="email">
        <input class="field design" type="email" name="email" required autocomplete="email" inputmode="email"
          value="${escapeHtml(this.email)}" placeholder="${escapeHtml(t("account:emailPlaceholder"))}"
          aria-label="${escapeHtml(t("account:emailPlaceholder"))}" ${busy ? "disabled" : ""}>
        ${goldButton({ label: t("account:send"), primary: true, type: "submit", attrs: { disabled: busy } })}
      </form>
      <div class="switches" role="group" aria-label="${escapeHtml(t("account:optionsLabel"))}">
        ${OPTIONS.map(option => this.toggle(option, this.choices[option], "choose", busy)).join("")}
      </div>
    `;
  }

  private pending({ pending, busy }: UserSnapshot): string {
    return /* html */ `
      <p class="description first" role="status">${t("account:pendingDescription", { email: pending?.email ?? "" })}</p>
      <form class="options" data-form="code">
        <input class="field design code" type="text" name="code" required autocomplete="one-time-code" inputmode="numeric"
          pattern="[0-9 ]{6,7}" maxlength="7" value="${escapeHtml(this.code)}"
          placeholder="000000" aria-label="${escapeHtml(t("account:codeLabel"))}" ${busy ? "disabled" : ""}>
        ${goldButton({ label: t("account:confirm"), primary: true, type: "submit", attrs: { disabled: busy } })}
      </form>
      <div class="row options">
        ${goldButton({ label: t("account:sendAgain"), attrs: { "data-action": "send-again", disabled: busy } })}
        ${goldButton({ label: t("account:otherEmail"), attrs: { "data-action": "other-email", disabled: busy } })}
      </div>
    `;
  }

  private signedIn(user: UserData, { sync, busy }: UserSnapshot): string {
    const syncText = sync === "synced" ? "account:syncSynced"
      : sync === "syncing" ? "account:syncSyncing"
      : "account:syncPending";
    return /* html */ `
      <div class="row">
        <span class="muted">${t("account:signedInAs")}</span>
        <span>${escapeHtml(user.email)}</span>
      </div>
      <div class="switches" role="group" aria-label="${escapeHtml(t("account:optionsLabel"))}">
        ${OPTIONS.map(option => this.toggle(option, user.options[option], "change", busy)).join("")}
      </div>
      <p class="description" role="status">${t(syncText)}</p>
      <div class="row options">
        ${goldButton({ label: t("account:signOut"), attrs: { "data-action": "sign-out", disabled: busy } })}
        ${goldButton({ label: t("account:delete"), attrs: { "data-action": "delete", disabled: busy } })}
      </div>
    `;
  }

  /** One `<gold-switch>` per update option; `mode` decides whether a change is a sign-up choice or a saved user option */
  private toggle(option: UserOption, on: boolean, mode: "choose" | "change", busy: boolean): string {
    const labels: Record<UserOption, string> = {
      bookUpdates: t("account:bookUpdates", { title: getBook().title, interpolation: { escapeValue: false } }),
      artistUpdates: t("account:artistUpdates", { author: getBook().author, interpolation: { escapeValue: false } }),
      publisherUpdates: t("account:publisherUpdates"),
    };
    return `<gold-switch label="${escapeHtml(labels[option])}" data-option="${option}" data-mode="${mode}"${on ? " checked" : ""}${busy ? " disabled" : ""}></gold-switch>`;
  }

  private notice(notice: UserNotice | null): string {
    if (!notice) return "";
    const text = typeof notice === "string"
      ? t(notice === "confirmed" ? "account:confirmed" : notice === "deleted" ? "account:deleted" : "account:signedOut")
      : t(`account:errors.${notice.error}`, { defaultValue: t("account:errors.server-error") });
    return `<p class="description notice" role="${typeof notice === "string" ? "status" : "alert"}">${text}</p>`;
  }

  protected onAction(action: string): void {
    if (action === "send-again") {
      const pending = this.user.getSnapshot().pending;
      if (pending) void this.user.requestLogin(pending.email, this.choices);
    } else if (action === "other-email") {
      this.code = "";
      this.user.cancelPending();
    } else if (action === "sign-out") {
      void this.user.signOut();
    } else if (action === "delete") {
      if (window.confirm(t("account:deleteConfirm"))) void this.user.deleteUser();
    }
  }

  /** Signed out, a switch updates the pending sign-up choices; signed in, it saves the user's option */
  private handleSwitch = (event: Event) => {
    const element = event.target;
    if (!(element instanceof GoldSwitch)) return;
    const option = element.dataset.option as UserOption;
    if (element.dataset.mode === "choose") this.choices = { ...this.choices, [option]: element.checked };
    else void this.user.setOption(option, element.checked);
  };

  private handleInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === "email") this.email = input.value;
    if (input.name === "code") this.code = input.value;
  };

  private handleSubmit = (event: Event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (form.dataset.form === "email") {
      void this.user.requestLogin(this.email, this.choices).then(sent => {
        if (sent) this.code = "";
      });
    } else if (form.dataset.form === "code") {
      void this.user.confirmCode(this.code).then(done => {
        if (done) this.code = "";
      });
    }
  };
}

customElements.define("settings-account", SettingsAccount);
