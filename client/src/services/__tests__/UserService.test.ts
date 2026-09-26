import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserService, LOGIN_PARAM } from "../UserService";
import { ApiError, ApiRequest, ApiService } from "../ApiService";
import { createGameStore } from "@/store/GameStore";
import { UserData, IGame, ProgressRecord } from "@/types";
import { getBook, getEntries } from "@/utils/game-config";

const bookId = getBook().id;
const [entryA, entryB, entryC] = getEntries().map(e => e.id);

/** In-memory stand-in for the PHP API (server/api) – the behaviour the client relies on */
class FakeApi extends ApiService {
  user: UserData = {
    email: "reader@example.com", language: "en", createdAt: "2026-09-27T00:00:00+00:00",
    options: { bookUpdates: true, artistUpdates: false, publisherUpdates: true },
  };
  progress: { record: ProgressRecord | null; updatedAt: number | null } = { record: null, updatedAt: null };
  offline = false;
  sessionValid = true;
  calls: Array<{ method: string; path: string; body?: any }> = [];

  constructor() {
    super("/api");
  }

  async request<T>(method: string, path: string, { body: raw, token }: ApiRequest = {}): Promise<T> {
    const body = raw as any;
    this.calls.push({ method, path, body });
    if (this.offline) throw new ApiError(0, "offline");
    const route = `${method} ${path}`;
    if (route === "POST /auth/request") return { requestId: "r1", expiresAt: new Date(Date.now() + 60_000).toISOString() } as T;
    if (route === "POST /auth/verify") {
      if (body.code && body.code !== "123456") throw new ApiError(400, "invalid-code");
      if (body.token && body.token !== "good-token") throw new ApiError(400, "invalid-link");
      return { session: "session-token", user: this.user, created: true } as T;
    }
    if (!token || !this.sessionValid) throw new ApiError(401, "unauthorized");
    if (route === "GET /user") return { user: this.user } as T;
    if (route === "PATCH /user") {
      this.user = { ...this.user, options: { ...this.user.options, ...body.options } };
      return { user: this.user } as T;
    }
    if (route === "POST /auth/logout" || route === "DELETE /user") return null as T;
    if (route === `GET /progress/${bookId}`) return structuredClone(this.progress) as T;
    if (route === `PUT /progress/${bookId}`) {
      if (body.baseUpdatedAt !== this.progress.updatedAt) throw new ApiError(409, "conflict", structuredClone(this.progress));
      this.progress = { record: structuredClone(body.record), updatedAt: (this.progress.updatedAt ?? 0) + 1 };
      return { updatedAt: this.progress.updatedAt } as T;
    }
    throw new ApiError(404, "not-found");
  }

  puts() {
    return this.calls.filter(c => c.method === "PUT");
  }
}

const remoteRecord = (consulted: Record<string, number>): ProgressRecord => ({
  format: 1, bookId, appVersions: ["1.0.0"], unlocked: {}, consulted, lastSpreadId: null, lastCategory: null, onboarded: true,
});

// happy-dom's history API doesn't move window.location (see LinkService.test.ts)
const setUrl = (url: string) => (window as any).happyDOM.setURL(new URL(url, window.location.origin).href);

const signedInStorage = () =>
  localStorage.setItem("osct-user", JSON.stringify({ session: "session-token", user: new FakeApi().user }));

describe("UserService", () => {
  let game: IGame;
  let api: FakeApi;
  const service = () => new UserService(api, 0);

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
});

describe("ApiService", () => {
  const respond = (status: number, body: unknown) =>
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body === null ? null : JSON.stringify(body), { status }));

  it("sends JSON with the session token and returns the answer", async () => {
    respond(200, { user: { email: "a@b.c" } });
    const api = new ApiService("https://api.example");
    await expect(api.request("PATCH", "/user", { body: { x: 1 }, token: "t" })).resolves.toEqual({ user: { email: "a@b.c" } });
    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(url).toBe("https://api.example/user");
    expect(init).toMatchObject({ method: "PATCH", body: '{"x":1}', headers: { Authorization: "Bearer t", "Content-Type": "application/json" } });
  });

  it("turns the API's error into an ApiError with its code; no connection = offline", async () => {
    const api = new ApiService("/api");
    respond(410, { error: { code: "expired", message: "…" } });
    await expect(api.request("POST", "/auth/verify")).rejects.toMatchObject({ status: 410, code: "expired" });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.request("GET", "/user")).rejects.toMatchObject({ status: 0, code: "offline" });
    respond(204, null);
    await expect(api.request("DELETE", "/user")).resolves.toBeNull();
  });

  it("is off without an API URL", () => {
    expect(new ApiService("").isEnabled()).toBe(false);
  });
});
