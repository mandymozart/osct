import { resolve } from "$app/paths";
import { ApiError, getToken, logout, me, requestCode, setToken, signInWithPassword, verifyCode, type User } from "./api";

/**
 * Who is signed in: the instance user of the accounts API (sign-in by email code or password, as the reader's
 * account). The editor needs the role `editor`, the admin page (`/admin`) the role `admin` – an admin grants them
 * there, or the deployment's `EDITORS` / `ADMINS` lists at sign-in (docs/server.md "Roles").
 */
class Session {
  user = $state<User | null>(null);
  /** `unknown` until the stored token was checked */
  status = $state<"unknown" | "out" | "in">("unknown");
  error = $state<string | null>(null);
  busy = $state(false);
  /** A code was requested for this address: the code form shows */
  pending = $state<{ email: string; requestId: string } | null>(null);

  get isEditor(): boolean {
    return this.has("editor");
  }

  get isAdmin(): boolean {
    return this.has("admin");
  }

  has(role: string): boolean {
    return this.user?.roles?.includes(role) ?? false;
  }

  /** The stored token, checked once at startup (`again`: reload the user, e.g. after their own roles changed) */
  async restore(again = false): Promise<void> {
    if (this.status !== "unknown" && !again) return;
    if (!getToken()) {
      this.status = "out";
      return;
    }
    try {
      this.user = (await me()).user;
      this.status = "in";
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setToken(null);
      this.status = "out";
      this.error = error instanceof ApiError && error.status !== 401 ? error.message : null;
    }
  }

  async sendCode(email: string): Promise<void> {
    await this.run(async () => {
      const { requestId } = await requestCode(email);
      this.pending = { email, requestId };
    });
  }

  async confirmCode(code: string): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    await this.run(async () => {
      const { session, user } = await verifyCode(pending.requestId, code);
      this.signedIn(session, user);
    });
  }

  async signInPassword(email: string, password: string): Promise<void> {
    await this.run(async () => {
      const { session, user } = await signInWithPassword(email, password);
      this.signedIn(session, user);
    });
  }

  async signOut(): Promise<void> {
    try {
      await logout();
    } catch {
      // the token may be gone already
    }
    setToken(null);
    this.user = null;
    this.pending = null;
    this.status = "out";
  }

  private signedIn(token: string, user: User) {
    setToken(token);
    this.user = user;
    this.pending = null;
    this.status = "in";
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      await action();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }
}

export const session = new Session();

/** The admin page (docs/admin.md) and below – for admins; every other page is for editors */
export const isAdminPath = (pathname: string): boolean => `${pathname}/` === resolve("admin/") || pathname.startsWith(resolve("admin/"));
