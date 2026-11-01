import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserService, LOGIN_PARAM } from "../UserService";
import { ApiError, type ApiRequest, ApiService } from "../ApiService";
import { createGameStore } from "@/store/GameStore";
import type { UserData, IGame, ProgressRecord } from "@/types";
import { getBook, getEntries } from "@/utils/game-config";

const bookId = getBook().id;
const [entryA, entryB, entryC] = getEntries().map(e => e.id);

/** In-memory stand-in for the PHP API (server/api) – the behaviour the client relies on */
class FakeApi extends ApiService {
  user: UserData = {
    email: "reader@example.com", language: "en", createdAt: "2026-09-27T00:00:00+00:00",
    options: { bookUpdates: true, artistUpdates: false, publisherUpdates: true }, hasPassword: false,
  };
  /** The user's password (null = none) and whether this device just signed in by email (no current password needed) */
  password: string | null = null;
  freshEmailSession = false;
  progress: { record: ProgressRecord | null; updatedAt: number | null } = { record: null, updatedAt: null };
  offline = false;
  sessionValid = true;
  /** The browser's session cookie (#207): set by a sign-in with `session: "cookie"` or the exchange, read by the API */
  cookie: string | null = null;
  calls: Array<{ method: string; path: string; body?: any }> = [];

  constructor() {
    super("/api");
  }

  async request(method: string, path: string, { body: raw, token }: ApiRequest = {}): Promise<unknown> {
    const body = raw as any;
    this.calls.push({ method, path, body });
    if (this.offline) throw new ApiError(0, "offline");
    const route = `${method} ${path}`;
    if (route === "POST /auth/request") return { requestId: "r1", expiresAt: new Date(Date.now() + 60_000).toISOString() };
    if (route === "POST /auth/verify") {
      if (body.code && body.code !== "123456") throw new ApiError(400, "invalid-code");
      if (body.token && body.token !== "good-token") throw new ApiError(400, "invalid-link");
      this.freshEmailSession = true;
      return this.signIn(body, true);
    }
    if (route === "POST /auth/password") {
      if (this.password === null || body.password !== this.password) throw new ApiError(401, "invalid-credentials");
      this.user = { ...this.user, hasPassword: true };
      return this.signIn(body, false);
    }
    if (route === "POST /auth/cookie") {
      if (token !== "session-token" || !this.sessionValid) throw new ApiError(401, "unauthorized");
      this.cookie = "cookie-session";
      return { csrfToken: "csrf-1", user: this.user };
    }
    if (route === "POST /auth/logout" && token) return null;
    if (!this.cookie || !this.sessionValid) throw new ApiError(401, "unauthorized");
    if (route === "GET /user") return { user: this.user, csrfToken: "csrf-1" };
    if (route === "PATCH /user") {
      this.user = { ...this.user, options: { ...this.user.options, ...body.options } };
      return { user: this.user };
    }
    if (route === "PUT /user/password") {
      if (this.user.hasPassword && !this.freshEmailSession) {
        if (!body.currentPassword) throw new ApiError(403, "current-password-required");
        if (body.currentPassword !== this.password) throw new ApiError(403, "wrong-current-password");
      }
      this.password = body.password;
      this.user = { ...this.user, hasPassword: true };
      return { user: this.user };
    }
    if (route === "POST /auth/logout" || route === "DELETE /user") {
      this.cookie = null;
      return null;
    }
    if (route === `GET /progress/${bookId}`) return structuredClone(this.progress);
    if (route === `PUT /progress/${bookId}`) {
      if (body.baseUpdatedAt !== this.progress.updatedAt) throw new ApiError(409, "conflict", structuredClone(this.progress));
      this.progress = { record: structuredClone(body.record), updatedAt: (this.progress.updatedAt ?? 0) + 1 };
      return { updatedAt: this.progress.updatedAt };
    }
    throw new ApiError(404, "not-found");
  }

  /** A browser's sign-in sets the cookie and answers its CSRF token; any other the token itself */
  private signIn(body: any, created: boolean) {
    if (body.session !== "cookie") return { session: "session-token", user: this.user, created };
    this.cookie = "cookie-session";
    return { csrfToken: "csrf-1", user: this.user, created };
  }

  puts() {
    return this.calls.filter(c => c.method === "PUT");
  }
}

const remoteRecord = (consulted: Record<string, number>): ProgressRecord => ({
  format: 1, bookId, appVersions: ["1.0.0"], unlocked: {}, consulted, lastSpreadId: null, lastCategory: null, onboarded: true, variables: {},
});

// happy-dom's history API doesn't move window.location (see LinkService.test.ts)
const setUrl = (url: string) => (window as any).happyDOM.setURL(new URL(url, window.location.origin).href);

describe("UserService", () => {
  let game: IGame;
  let api: FakeApi;
  const service = () => new UserService(api, 0);
  /** Signed in on this device: the user as last seen in localStorage, the session in the browser's cookie */
  const signedInStorage = () => {
    localStorage.setItem("osct-user", JSON.stringify({ user: new FakeApi().user }));
    api.cookie = "cookie-session";
  };

  beforeEach(() => {
    localStorage.clear();
    setUrl("/");
    vi.spyOn(window.history, "replaceState").mockImplementation((_s, _t, url) => setUrl(String(url)));
    game = createGameStore();
    api = new FakeApi();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("sends the email, then signs in with the code and joins both progress records", async () => {
    game.history.consultEntry(entryA);
    api.progress = { record: remoteRecord({ [entryB]: 1 }), updatedAt: 7 };
    const users = service();
    await users.start(game);

    expect(await users.requestLogin(" reader@example.com ", { bookUpdates: true, artistUpdates: false, publisherUpdates: false })).toBe(true);
    expect(api.calls[0].body).toEqual({ email: "reader@example.com", options: { bookUpdates: true, artistUpdates: false, publisherUpdates: false }, language: "en" });
    expect(users.getSnapshot()).toMatchObject({ status: "pending", pending: { requestId: "r1", email: "reader@example.com" } });

    expect(await users.confirmCode("000000")).toBe(false);
    expect(users.getSnapshot()).toMatchObject({ status: "pending", notice: { error: "invalid-code" } });

    expect(await users.confirmCode("123456")).toBe(true);
    expect(users.getSnapshot()).toMatchObject({ status: "signed-in", user: { email: "reader@example.com" }, sync: "synced" });
    expect(game.history.isConsulted(entryA) && game.history.isConsulted(entryB)).toBe(true);
    expect(api.progress.record!.consulted).toHaveProperty(entryA);
    expect(api.puts()[0].body.baseUpdatedAt).toBe(7);
  });

  it("signs in with the link from the email and takes the token out of the address bar", async () => {
    setUrl(`/about?${LOGIN_PARAM}=good-token&osct=1.1.0`);
    const users = service();
    await users.start(game);
    expect(window.location.search).toBe("?osct=1.1.0");
    expect(users.getSnapshot()).toMatchObject({ status: "signed-in", notice: "confirmed" });
  });

  it("tells the reader when the link is not valid", async () => {
    setUrl(`/about?${LOGIN_PARAM}=old-token`);
    const users = service();
    await users.start(game);
    expect(users.getSnapshot()).toMatchObject({ status: "signed-out", notice: { error: "invalid-link" } });
  });

  it("sends every change after a pause, building on the last version", async () => {
    signedInStorage();
    const users = service();
    await users.start(game);
    const before = api.puts().length;
    game.history.consultEntry(entryC);
    await users.pushNow();
    expect(api.puts().length).toBe(before + 1);
    expect(api.progress.record!.consulted).toHaveProperty(entryC);
    expect(users.getSnapshot().sync).toBe("synced");
  });

  it("another device saved in between: takes its progress in and sends again", async () => {
    signedInStorage();
    const users = service();
    await users.start(game);
    api.progress = { record: remoteRecord({ [entryB]: 1 }), updatedAt: 50 }; // the other device
    game.history.consultEntry(entryA);
    await users.pushNow();
    expect(game.history.isConsulted(entryB)).toBe(true);
    expect(api.progress.record!.consulted).toMatchObject({ [entryA]: expect.any(Number), [entryB]: 1 });
    expect(api.progress.updatedAt).toBe(51);
  });

  it("at startup a newer record from the account replaces this device's (no unsent changes)", async () => {
    signedInStorage();
    game.history.consultEntry(entryA); // e.g. before a reset on the other device
    // (no service listened yet: the change counts as synced)
    localStorage.setItem(`osct-user-sync:${bookId}`, JSON.stringify({ email: "reader@example.com", updatedAt: 3, dirty: false }));
    api.progress = { record: remoteRecord({ [entryB]: 1 }), updatedAt: 9 };
    await service().start(game);
    expect(game.history.isConsulted(entryA)).toBe(false);
    expect(game.history.isConsulted(entryB)).toBe(true);
    expect(api.puts()).toHaveLength(0);
  });

  it("offline: keeps the changes for later", async () => {
    signedInStorage();
    const users = service();
    await users.start(game);
    api.offline = true;
    game.history.consultEntry(entryA);
    await users.pushNow();
    expect(users.getSnapshot().sync).toBe("pending");
    api.offline = false;
    await users.syncProgress(false);
    expect(api.progress.record!.consulted).toHaveProperty(entryA);
  });

  it("a session the server no longer knows signs out on this device", async () => {
    signedInStorage();
    api.sessionValid = false;
    const users = service();
    await users.start(game);
    expect(users.getSnapshot()).toMatchObject({ status: "signed-out", notice: "signed-out" });
    expect(localStorage.getItem("osct-user")).toBeNull();
  });

  it("changes an update option in the account", async () => {
    signedInStorage();
    const users = service();
    await users.start(game);
    await users.setOption("bookUpdates", false);
    expect(users.getSnapshot().user!.options).toEqual({ bookUpdates: false, artistUpdates: false, publisherUpdates: true });
    expect(JSON.parse(localStorage.getItem("osct-user")!).user.options.bookUpdates).toBe(false);
  });

  it("a reset of the book reaches the account", async () => {
    signedInStorage();
    const users = service();
    await users.start(game);
    game.history.consultEntry(entryA);
    await users.pushNow();
    expect(api.progress.record!.consulted).toHaveProperty(entryA);
    game.history.reset();
    await users.pushNow();
    expect(api.progress.record!.consulted).toEqual({});
  });

  it("signs out and deletes the account – the progress stays on this device", async () => {
    signedInStorage();
    const users = service();
    await users.start(game);
    game.history.consultEntry(entryA);
    await users.signOut();
    expect(users.getSnapshot()).toMatchObject({ status: "signed-out", notice: "signed-out" });
    expect(game.history.isConsulted(entryA)).toBe(true);

    signedInStorage();
    const again = service();
    await again.start(game);
    expect(await again.deleteUser()).toBe(true);
    expect(again.getSnapshot()).toMatchObject({ status: "signed-out", notice: "deleted" });
    expect(api.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/user" });
  });

  it("signs in with a password and offers the browser to save it", async () => {
    const stored: unknown[] = [];
    vi.stubGlobal("PasswordCredential", class { constructor(public data: unknown) { stored.push(data); } });
    Object.defineProperty(navigator, "credentials", { configurable: true, value: { store: vi.fn().mockResolvedValue(undefined) } });
    api.password = "a good password";
    const users = service();
    await users.start(game);

    expect(await users.signInWithPassword("reader@example.com", "wrong")).toBe(false);
    expect(users.getSnapshot()).toMatchObject({ status: "signed-out", notice: { error: "invalid-credentials" } });

    expect(await users.signInWithPassword(" reader@example.com ", "a good password")).toBe(true);
    expect(api.calls.filter(c => c.path === "/auth/password").at(-1)!.body).toEqual({ email: "reader@example.com", password: "a good password", session: "cookie" });
    expect(users.getSnapshot()).toMatchObject({ status: "signed-in", notice: "signed-in" });
    expect(stored).toEqual([{ id: "reader@example.com", password: "a good password" }]);
    // Signed in with the password: changing it asks for the current one
    expect(users.passwordNeedsCurrent()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("sets a password after an email sign-in without the current one", async () => {
    const users = service();
    await users.start(game);
    await users.requestLogin("reader@example.com", { bookUpdates: false, artistUpdates: false, publisherUpdates: false });
    await users.confirmCode("123456");
    expect(users.passwordNeedsCurrent()).toBe(false);

    expect(await users.setPassword("a new password")).toBe(true);
    expect(api.calls.at(-1)).toMatchObject({ method: "PUT", path: "/user/password", body: { password: "a new password" } });
    expect(users.getSnapshot()).toMatchObject({ notice: "password-saved", user: { hasPassword: true } });
    // Right after the email sign-in the current password is still not needed ("forgot password")
    expect(users.passwordNeedsCurrent()).toBe(false);
  });

  it("an older session (or the server's say) asks for the current password", async () => {
    api.user = { ...api.user, hasPassword: true };
    api.password = "a good password";
    signedInStorage();
    const users = service();
    await users.start(game);
    expect(users.passwordNeedsCurrent()).toBe(true);
    expect(await users.setPassword("another one")).toBe(false);
    expect(users.getSnapshot().notice).toEqual({ error: "current-password-required" });
    expect(await users.setPassword("another one", "a good password")).toBe(true);
  });

  describe("the session is the API's cookie (#207)", () => {
    it("a sign-in asks for the cookie, keeps its CSRF token in memory and stores no session token", async () => {
      const csrf = vi.spyOn(api, "setCsrfToken");
      const users = service();
      await users.start(game);
      await users.requestLogin("reader@example.com", { bookUpdates: false, artistUpdates: false, publisherUpdates: false });
      expect(await users.confirmCode("123456")).toBe(true);
      expect(api.calls.find(c => c.path === "/auth/verify")!.body).toEqual({ requestId: "r1", code: "123456", session: "cookie" });
      expect(csrf).toHaveBeenCalledWith("csrf-1");
      const stored = JSON.parse(localStorage.getItem("osct-user")!);
      expect(stored).not.toHaveProperty("session");
      expect(JSON.stringify(stored)).not.toContain("cookie-session");
      expect(users.getSnapshot()).toMatchObject({ status: "signed-in", sync: "synced" });
    });

    it("the link from the email asks for the cookie too", async () => {
      setUrl(`/about?${LOGIN_PARAM}=good-token`);
      await service().start(game);
      expect(api.calls.find(c => c.path === "/auth/verify")!.body).toEqual({ token: "good-token", session: "cookie" });
      expect(api.cookie).toBe("cookie-session");
    });

    it("at startup GET /user hands over the CSRF token; signing out ends the cookie and forgets it", async () => {
      signedInStorage();
      const csrf = vi.spyOn(api, "setCsrfToken");
      const users = service();
      await users.start(game);
      expect(csrf).toHaveBeenLastCalledWith("csrf-1");
      await users.signOut();
      expect(api.calls.at(-1)).toMatchObject({ method: "POST", path: "/auth/logout" });
      expect(api.cookie).toBeNull();
      expect(csrf).toHaveBeenLastCalledWith(null);
    });

    it("a token stored by an app from before the cookie is exchanged once, then the stored session keeps none", async () => {
      localStorage.setItem("osct-user", JSON.stringify({ session: "session-token", user: new FakeApi().user, method: "password", signedInAt: 5 }));
      const users = service();
      await users.start(game);
      expect(api.calls[0]).toMatchObject({ method: "POST", path: "/auth/cookie" });
      expect(api.cookie).toBe("cookie-session");
      expect(JSON.parse(localStorage.getItem("osct-user")!)).toEqual({ user: api.user, method: "password", signedInAt: 5 });
      expect(users.getSnapshot()).toMatchObject({ status: "signed-in", sync: "synced" });
      expect(api.calls.some(c => c.path === `/progress/${bookId}`)).toBe(true);
    });

    it("a stored token the API no longer knows signs out: sign in as usual", async () => {
      localStorage.setItem("osct-user", JSON.stringify({ session: "old-token", user: new FakeApi().user }));
      const users = service();
      await users.start(game);
      expect(users.getSnapshot()).toMatchObject({ status: "signed-out", notice: "signed-out" });
      expect(localStorage.getItem("osct-user")).toBeNull();
    });

    it("offline, the stored token waits for the next start – and nothing syncs without the cookie", async () => {
      localStorage.setItem("osct-user", JSON.stringify({ session: "session-token", user: new FakeApi().user }));
      api.offline = true;
      const users = service();
      await users.start(game);
      expect(JSON.parse(localStorage.getItem("osct-user")!).session).toBe("session-token");
      expect(users.getSnapshot().status).toBe("signed-in");
      game.history.consultEntry(entryA);
      api.offline = false;
      await users.pushNow();
      expect(api.calls.filter(c => c.path.startsWith("/progress/"))).toHaveLength(0);
    });
  });

  describe("data from outside the app is checked", () => {
    it("a stored session of the wrong shape counts as signed out", async () => {
      for (const stored of ['{"session":42,"user":{"email":"a@b.c"}}', '{"session":"s"}', "[1,2]", "not json"]) {
        localStorage.setItem("osct-user", stored);
        expect(service().getSnapshot().status).toBe("signed-out");
      }
    });

    it("a stored session with fewer fields stays signed in, the missing ones get defaults until GET /user", () => {
      localStorage.setItem("osct-user", JSON.stringify({ session: "session-token", user: { email: "reader@example.com" }, method: "sms", signedInAt: "x" }));
      const users = service();
      expect(users.getSnapshot()).toMatchObject({
        status: "signed-in",
        user: { email: "reader@example.com", language: "en", hasPassword: false, options: { bookUpdates: false, artistUpdates: false, publisherUpdates: false } },
      });
      expect(users.passwordNeedsCurrent()).toBe(false);
    });

    it("a stored pending sign-in of the wrong shape is dropped", () => {
      localStorage.setItem("osct-user-pending", JSON.stringify({ requestId: 1, email: "a@b.c" }));
      expect(service().getSnapshot()).toMatchObject({ status: "signed-out", pending: null });
    });

    it("a stored sync state of the wrong shape starts over (sends this device's progress)", async () => {
      signedInStorage();
      localStorage.setItem(`osct-user-sync:${bookId}`, JSON.stringify({ email: "reader@example.com", updatedAt: "3", dirty: "no" }));
      api.progress = { record: remoteRecord({ [entryB]: 1 }), updatedAt: 9 };
      game.history.consultEntry(entryA);
      await service().start(game);
      // Merged like a fresh device instead of replacing this device's record
      expect(game.history.isConsulted(entryA) && game.history.isConsulted(entryB)).toBe(true);
      expect(api.puts()).toHaveLength(1);
    });

    it("a sign-in answer without a CSRF token is a server error, not a broken session", async () => {
      const request = api.request.bind(api);
      vi.spyOn(api, "request").mockImplementation(async (method, path, options) =>
        path === "/auth/password" ? { user: api.user } : request(method, path, options));
      api.password = "a good password";
      const users = service();
      expect(await users.signInWithPassword("reader@example.com", "a good password")).toBe(false);
      expect(users.getSnapshot()).toMatchObject({ status: "signed-out", notice: { error: "server-error" } });
      expect(localStorage.getItem("osct-user")).toBeNull();
    });

    it("a progress answer of the wrong shape leaves the changes waiting", async () => {
      signedInStorage();
      const users = service();
      await users.start(game);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const request = api.request.bind(api);
      vi.spyOn(api, "request").mockImplementation(async (method, path, options) =>
        method === "PUT" && path.startsWith("/progress/") ? { updatedAt: "soon" } : request(method, path, options));
      game.history.consultEntry(entryA);
      await users.pushNow();
      expect(users.getSnapshot().sync).toBe("pending");
    });

    it("passes the waiting time of a refused request on, ignores one that is not a number", async () => {
      const users = service();
      vi.spyOn(api, "request").mockRejectedValueOnce(new ApiError(429, "too-many-requests", { error: { code: "too-many-requests", retryAfter: 60 } }));
      await users.requestLogin("reader@example.com", { bookUpdates: false, artistUpdates: false, publisherUpdates: false });
      expect(users.getSnapshot().notice).toEqual({ error: "too-many-requests", retryAfter: 60 });
      vi.spyOn(api, "request").mockRejectedValueOnce(new ApiError(429, "too-many-requests", { error: { retryAfter: "60" } }));
      await users.requestLogin("reader@example.com", { bookUpdates: false, artistUpdates: false, publisherUpdates: false });
      expect(users.getSnapshot().notice).toEqual({ error: "too-many-requests" });
    });
  });
});
