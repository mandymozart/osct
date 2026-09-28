import i18next from "i18next";
import {
  UserData,
  UserNotice,
  UserOption,
  UserOptions,
  UserSnapshot,
  IUserService,
  IGame,
  PendingLogin,
  ProgressRecord,
} from "@/types";
import { ApiError, ApiService } from "./ApiService";

/** Query parameter of the link in the confirmation email: `/about?login=<token>` (server: Auth.php) */
export const LOGIN_PARAM = "login";

const SESSION_KEY = "osct-user";
const PENDING_KEY = "osct-user-pending";
const syncKey = (bookId: string) => `osct-user-sync:${bookId}`;

interface StoredSession {
  session: string;
  user: UserData;
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
    console.warn("[UserService] Failed to store:", error);
  }
};

/**
 * The reader's account (the *user* in code, types/user.ts): email sign-in (link or code), update options,
 * and progress sync with the account.
 *
 * Progress sync – the device's record (localStorage) stays the working copy; the account holds a copy:
 * - every change is sent after a short pause (`PUT` with the version it builds on);
 * - if the server has a newer version (another device), it replaces this device's record at startup,
 *   unless this device has unsent changes – then both are merged (`mergeProgress`) and sent;
 * - signing in merges this device's progress with the account's; a reset is sent like any other change;
 * - offline, changes wait and are sent once the device is back online.
 */
export class UserService implements IUserService {
  private static instance: UserService | null = null;

  private game: IGame | null = null;
  private stored: StoredSession | null = read<StoredSession>(SESSION_KEY);
  private pending: PendingLogin | null = read<PendingLogin>(PENDING_KEY);
  private snapshot: UserSnapshot;
  private listeners = new Set<(snapshot: UserSnapshot) => void>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing: Promise<void> | null = null;
  /** Changes made while a push was running (sent next) */
  private changedDuringPush = false;
  /** Applying the account's record – must not count as a local change */
  private applying = false;

  static getInstance(): UserService {
    if (!UserService.instance) UserService.instance = new UserService();
    return UserService.instance;
  }

  constructor(private readonly api: ApiService = ApiService.getInstance(), private readonly pushDelayMs = 1500) {
    if (this.pending && Date.parse(this.pending.expiresAt) < Date.now()) this.setPending(null);
    this.snapshot = this.build({ sync: "off", busy: false, notice: null });
  }

  isEnabled(): boolean {
    return this.api.isEnabled();
  }

  /**
   * Call at startup (main.ts, before the incoming link is routed): consumes a login token from the URL and
   * confirms it, otherwise validates the stored session and syncs the progress.
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

  getSnapshot(): UserSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: UserSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async requestLogin(email: string, options: UserOptions): Promise<boolean> {
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

  async setOption(option: UserOption, on: boolean): Promise<void> {
    await this.run(async () => {
      const { user } = await this.api.request<{ user: UserData }>("PATCH", "/user", {
        body: { options: { [option]: on } },
        token: this.stored?.session,
      });
      this.setSession(this.stored && { ...this.stored, user });
    }, undefined);
  }

  async signOut(): Promise<void> {
    const session = this.stored?.session;
    this.signedOutLocally("signed-out");
    // Ask the server to drop the session; if unreachable, it expires on the server by itself
    if (session) await this.api.request("POST", "/auth/logout", { token: session }).catch(() => undefined);
  }

  async deleteUser(): Promise<boolean> {
    return this.run(async () => {
      await this.api.request("DELETE", "/user", { token: this.stored?.session });
      this.signedOutLocally("deleted");
      return true;
    }, false);
  }

  clearNotice(): void {
    if (this.snapshot.notice) this.update({ notice: null });
  }

  /**
   * Reconciles this device with the account (see class comment). `link`: the device joins the account
   * now (sign-in), so the account's record is always merged.
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

  /** Sends the record now (after the debounce pause, or when the app goes to the background) */
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
    // On a 409 conflict (another device saved in between) merge its version and retry, a few times at most
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
      // Offline or server failure: changes wait (sent when back online or on the next change)
      if (!(error instanceof ApiError && error.code === "offline")) console.warn("[UserService] Progress sync failed:", error);
      this.update({ sync: "pending" });
    }
  }

  /** Validates the stored session, takes over the account's current options, then syncs */
  private async refresh(): Promise<void> {
    try {
      const { user } = await this.api.request<{ user: UserData }>("GET", "/user", { token: this.stored?.session });
      this.setSession(this.stored && { ...this.stored, user });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.signedOutLocally("signed-out");
        return;
      }
      // Offline: keep the stored session, sync later
    }
    await this.syncProgress(false);
  }

  private async confirmLink(token: string): Promise<void> {
    this.update({ busy: true, notice: null });
    try {
      await this.signedIn(await this.api.request("POST", "/auth/verify", { body: { token } }), "confirmed");
    } catch (error) {
      this.update({ notice: { error: error instanceof ApiError ? error.code : "server-error" } });
      // Invalid link (e.g. from an older email) while already signed in: stay signed in
      if (this.stored) await this.refresh();
    } finally {
      this.update({ busy: false });
    }
  }

  private async signedIn(result: { session: string; user: UserData }, notice: UserNotice | null): Promise<void> {
    this.setSession({ session: result.session, user: result.user });
    this.setPending(null);
    this.setSyncState(this.freshSyncState());
    this.update({ notice: notice ?? "confirmed", sync: "syncing" });
    await this.syncProgress(true);
  }

  private signedOutLocally(notice: UserNotice): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.setSyncState(null);
    this.setSession(null);
    this.update({ sync: "off", notice });
  }

  /** Runs an account action: `busy` while running; an error becomes the notice (401 signs out) */
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
    return { email: this.stored?.user.email ?? "", updatedAt: null, dirty: true };
  }

  private syncState(): SyncState {
    const bookId = this.game?.state.progress.bookId ?? "";
    const stored = read<SyncState>(syncKey(bookId));
    return stored && stored.email === this.stored?.user.email ? stored : this.freshSyncState();
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

  private build(rest: Pick<UserSnapshot, "sync" | "busy" | "notice">): UserSnapshot {
    const status = this.stored ? "signed-in" : this.pending ? "pending" : "signed-out";
    return { status, user: this.stored?.user ?? null, pending: this.pending, ...rest };
  }

  private update(changes: Partial<Pick<UserSnapshot, "sync" | "busy" | "notice">>): void {
    const { sync, busy, notice } = { ...this.snapshot, ...changes };
    this.snapshot = this.build({ sync, busy, notice });
    this.listeners.forEach(listener => listener(this.snapshot));
  }
}
