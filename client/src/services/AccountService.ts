import i18next from "i18next";
import {
  AccountData,
  AccountNotice,
  AccountOption,
  AccountOptions,
  AccountSnapshot,
  IAccountService,
  IGame,
  PendingLogin,
  ProgressRecord,
} from "@/types";
import { ApiError, ApiService } from "./ApiService";

/** Query parameter of the link in the confirmation email: `/about?login=<token>` (server: Auth.php) */
export const LOGIN_PARAM = "login";

const SESSION_KEY = "osct-account";
const PENDING_KEY = "osct-account-pending";
const syncKey = (bookId: string) => `osct-account-sync:${bookId}`;

interface StoredSession {
  session: string;
  account: AccountData;
}

/**
 * What this device knows about the progress on the server: the version it last saw (`updatedAt`) and
 * whether it has changes the server doesn't have yet (`dirty`). Per account (email).
 */
interface SyncState {
  email: string;
  updatedAt: number | null;
  dirty: boolean;
}

interface ProgressResponse {
  record: unknown;
  updatedAt: number | null;
}

const read = <T>(key: string): T | null => {
  try {
    const text = localStorage.getItem(key);
    return text === null ? null : (JSON.parse(text) as T);
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("[AccountService] Failed to store:", error);
  }
};

/**
 * Reader account (types/account.ts): signing in by email (link or code), the update options, and the
 * progress kept in the account.
 *
 * Progress sync – this device's record stays the one the app works with (localStorage), the account
 * holds a copy:
 * - every change is sent after a short pause (`PUT`, naming the version it builds on);
 * - the server has a newer version (another device) → at startup it replaces this device's record,
 *   unless this device has unsent changes – then both are merged (`mergeProgress`) and sent;
 * - signing in merges this device's progress with the account's; a reset is sent like any other change;
 * - offline: the changes wait and go out when the device is back online.
 */
export class AccountService implements IAccountService {
  private static instance: AccountService | null = null;

  private game: IGame | null = null;
  private stored: StoredSession | null = read<StoredSession>(SESSION_KEY);
  private pending: PendingLogin | null = read<PendingLogin>(PENDING_KEY);
  private snapshot: AccountSnapshot;
  private listeners = new Set<(snapshot: AccountSnapshot) => void>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing: Promise<void> | null = null;
  /** Changes while a push was running (sent next) */
  private changedDuringPush = false;
  /** Taking over the account's record – not a change of this device */
  private applying = false;

  static getInstance(): AccountService {
    if (!AccountService.instance) AccountService.instance = new AccountService();
    return AccountService.instance;
  }

  constructor(private readonly api: ApiService = ApiService.getInstance(), private readonly pushDelayMs = 1500) {
    if (this.pending && Date.parse(this.pending.expiresAt) < Date.now()) this.setPending(null);
    this.snapshot = this.build({ sync: "off", busy: false, notice: null });
  }

  isEnabled(): boolean {
    return this.api.isEnabled();
  }

  /**
   * At startup (main.ts, before the incoming link is routed): takes the login token out of the URL and
   * confirms it, else checks the stored session and syncs the progress.
   */
  start(game: IGame): Promise<void> {
    this.game = game;
    if (!this.isEnabled()) return Promise.resolve();
    game.subscribeToProperty("progress", this.onProgressChange);
    window.addEventListener("online", () => void this.syncProgress(false));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.pushTimer) void this.pushNow();
    });

    const url = new URL(window.location.href);
    const token = url.searchParams.get(LOGIN_PARAM);
    if (token) {
      url.searchParams.delete(LOGIN_PARAM);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      return this.confirmLink(token);
    }
    return this.stored ? this.refresh() : Promise.resolve();
  }

  getSnapshot(): AccountSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: AccountSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async requestLogin(email: string, options: AccountOptions): Promise<boolean> {
    return this.run(async () => {
      const result = await this.api.request<{ requestId: string; expiresAt: string }>("POST", "/auth/request", {
        body: { email: email.trim(), options, language: i18next.resolvedLanguage },
      });
      this.setPending({ requestId: result.requestId, email: email.trim(), expiresAt: result.expiresAt });
      return true;
    }, false);
  }

  async confirmCode(code: string): Promise<boolean> {
    const pending = this.pending;
    if (!pending) return false;
    return this.run(async () => {
      await this.signedIn(await this.api.request("POST", "/auth/verify", { body: { requestId: pending.requestId, code } }), null);
      return true;
    }, false);
  }

  cancelPending(): void {
    this.setPending(null);
    this.update({ notice: null });
  }

  async setOption(option: AccountOption, on: boolean): Promise<void> {
    await this.run(async () => {
      const { account } = await this.api.request<{ account: AccountData }>("PATCH", "/account", {
        body: { options: { [option]: on } },
        token: this.stored?.session,
      });
      this.setSession(this.stored && { ...this.stored, account });
    }, undefined);
  }

  async signOut(): Promise<void> {
    const session = this.stored?.session;
    this.signedOutLocally("signed-out");
    // The server forgets this device's session; not reachable → it expires there by itself
    if (session) await this.api.request("POST", "/auth/logout", { token: session }).catch(() => undefined);
  }

  async deleteAccount(): Promise<boolean> {
    return this.run(async () => {
      await this.api.request("DELETE", "/account", { token: this.stored?.session });
      this.signedOutLocally("deleted");
      return true;
    }, false);
  }

  clearNotice(): void {
    if (this.snapshot.notice) this.update({ notice: null });
  }

  /**
   * Bring this device and the account together (see class comment). `link`: this device joins the
   * account now (sign-in) – merge whatever the account has.
   */
  async syncProgress(link: boolean): Promise<void> {
    const game = this.game;
    if (!game || !this.canSync()) return;
    const state = link ? this.freshSyncState() : this.syncState();
    this.update({ sync: "syncing" });
    try {
      const remote = await this.api.request<ProgressResponse>("GET", `/progress/${encodeURIComponent(game.state.progress.bookId)}`, {
        token: this.stored?.session,
      });
      if (remote.record !== null && remote.updatedAt !== state.updatedAt) {
        const mode = link || state.dirty ? "merge" : "replace";
        const applied = this.apply(remote.record, mode);
        state.updatedAt = remote.updatedAt;
        state.dirty = mode === "merge" || !applied;
      } else if (remote.record === null) {
        state.updatedAt = null;
        state.dirty = true;
      }
      this.setSyncState(state);
      if (state.dirty) await this.pushNow();
      else this.update({ sync: "synced" });
    } catch (error) {
      this.handleSyncError(error);
    }
  }

  /** Send the record now (a pause after the last change has passed, or the app goes to the background) */
  async pushNow(): Promise<void> {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    if (this.pushing) {
      this.changedDuringPush = true;
      return this.pushing;
    }
    this.pushing = this.push().finally(() => {
      this.pushing = null;
    });
    await this.pushing;
    if (this.changedDuringPush) {
      this.changedDuringPush = false;
      await this.pushNow();
    }
  }

  // --- internals ---

  private onProgressChange = () => {
    if (this.applying || !this.canSync()) return;
    const state = this.syncState();
    state.dirty = true;
    this.setSyncState(state);
    if (this.pushing) this.changedDuringPush = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.pushNow(), this.pushDelayMs);
  };

  private async push(): Promise<void> {
    const game = this.game;
    if (!game || !this.canSync()) return;
    const record: ProgressRecord = game.state.progress;
    // Another device may have saved in between: take its version in and try again (a few times)
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = this.syncState();
      this.update({ sync: "syncing" });
      try {
        const result = await this.api.request<{ updatedAt: number }>("PUT", `/progress/${encodeURIComponent(record.bookId)}`, {
          body: { record: game.state.progress, baseUpdatedAt: state.updatedAt },
          token: this.stored?.session,
        });
        this.setSyncState({ ...state, updatedAt: result.updatedAt, dirty: this.changedDuringPush });
        this.update({ sync: this.changedDuringPush ? "pending" : "synced" });
        return;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.code === "conflict") {
          const remote = error.data as ProgressResponse;
          this.apply(remote.record, "merge");
          this.setSyncState({ ...state, updatedAt: remote.updatedAt, dirty: true });
          continue;
        }
        this.handleSyncError(error);
        return;
      }
    }
    this.update({ sync: "pending" });
  }

  private apply(record: unknown, mode: "merge" | "replace"): boolean {
    if (!this.game) return false;
    this.applying = true;
    try {
      return this.game.history.applyStoredRecord(record, mode);
    } finally {
      this.applying = false;
    }
  }

  private handleSyncError(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) {
      this.signedOutLocally("signed-out");
    } else {
      // Offline or the server had a problem: the changes wait (sent when back online or at the next change)
      if (!(error instanceof ApiError && error.code === "offline")) console.warn("[AccountService] Progress sync failed:", error);
      this.update({ sync: "pending" });
    }
  }

  /** The stored session still valid? Takes the account's current options, then syncs */
  private async refresh(): Promise<void> {
    try {
      const { account } = await this.api.request<{ account: AccountData }>("GET", "/account", { token: this.stored?.session });
      this.setSession(this.stored && { ...this.stored, account });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.signedOutLocally("signed-out");
        return;
      }
      // Offline: keep the stored account, sync later
    }
    await this.syncProgress(false);
  }

  private async confirmLink(token: string): Promise<void> {
    this.update({ busy: true, notice: null });
    try {
      await this.signedIn(await this.api.request("POST", "/auth/verify", { body: { token } }), "confirmed");
    } catch (error) {
      this.update({ notice: { error: error instanceof ApiError ? error.code : "server-error" } });
      // A link from an older email while signed in on this device: stay signed in
      if (this.stored) await this.refresh();
    } finally {
      this.update({ busy: false });
    }
  }

  private async signedIn(result: { session: string; account: AccountData }, notice: AccountNotice | null): Promise<void> {
    this.setSession({ session: result.session, account: result.account });
    this.setPending(null);
    this.setSyncState(this.freshSyncState());
    this.update({ notice: notice ?? "confirmed", sync: "syncing" });
    await this.syncProgress(true);
  }

  private signedOutLocally(notice: AccountNotice): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.setSyncState(null);
    this.setSession(null);
    this.update({ sync: "off", notice });
  }

  /** Runs an account action: busy while it runs, its error becomes the notice */
  private async run<T>(action: () => Promise<T>, onError: T): Promise<T> {
    this.update({ busy: true, notice: null });
    try {
      return await action();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "server-error";
      if (error instanceof ApiError && error.status === 401) this.signedOutLocally({ error: code });
      else this.update({ notice: { error: code } });
      return onError;
    } finally {
      this.update({ busy: false });
    }
  }

  private canSync(): boolean {
    return this.stored !== null;
  }

  private freshSyncState(): SyncState {
    return { email: this.stored?.account.email ?? "", updatedAt: null, dirty: true };
  }

  private syncState(): SyncState {
    const bookId = this.game?.state.progress.bookId ?? "";
    const stored = read<SyncState>(syncKey(bookId));
    return stored && stored.email === this.stored?.account.email ? stored : this.freshSyncState();
  }

  private setSyncState(state: SyncState | null): void {
    const bookId = this.game?.state.progress.bookId;
    if (bookId) write(syncKey(bookId), state);
  }

  private setSession(stored: StoredSession | null): void {
    this.stored = stored;
    write(SESSION_KEY, stored);
    this.update({});
  }

  private setPending(pending: PendingLogin | null): void {
    this.pending = pending;
    write(PENDING_KEY, pending);
    if (this.snapshot) this.update({});
  }

  private build(rest: Pick<AccountSnapshot, "sync" | "busy" | "notice">): AccountSnapshot {
    const status = this.stored ? "signed-in" : this.pending ? "pending" : "signed-out";
    return { status, account: this.stored?.account ?? null, pending: this.pending, ...rest };
  }

  private update(changes: Partial<Pick<AccountSnapshot, "sync" | "busy" | "notice">>): void {
    const { sync, busy, notice } = { ...this.snapshot, ...changes };
    this.snapshot = this.build({ sync, busy, notice });
    this.listeners.forEach(listener => listener(this.snapshot));
  }
}
