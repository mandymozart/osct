import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/paths", () => ({ resolve: (path: string) => `/editor/${path.replace(/^\//, "")}` }));

const { api, getSession, setSession } = await import("../api");
const { session, SESSION_ENDED } = await import("../session.svelte");

const answer = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const unauthorized = () => answer(401, { error: { code: "unauthorized", message: "Session expired." } });
const USER = { email: "editor@example.test", language: "en", options: {}, hasPassword: false, roles: ["reader", "editor"], createdAt: "2026-01-01T00:00:00Z" };
const KEY = { csrfToken: "csrf-1", email: USER.email };

describe("session – the browser's cookie (#207)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    session.user = null;
    session.status = "unknown";
    session.error = null;
    session.notice = null;
    session.pending = null;
  });

  afterEach(() => {
    fetchMock.mockReset();
    setSession(null);
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("at startup asks the API whether the browser is signed in (the cookie): signed out, quietly", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    await session.restore();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/user");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("same-origin");
    expect(session.status).toBe("out");
    expect(session.error).toBeNull();
    expect(session.notice).toBeNull();
    expect(getSession()).toBeNull();
  });

  it("restores the cookie's session and keeps its CSRF token in memory only", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { user: USER, csrfToken: "csrf-1" }));
    await session.restore();
    expect(session.status).toBe("in");
    expect(session.isEditor).toBe(true);
    expect(session.isAdmin).toBe(false);
    expect(getSession()).toEqual(KEY);
    expect(localStorage.length).toBe(0);
  });

  it("a startup check that fails otherwise tells why", async () => {
    fetchMock.mockResolvedValueOnce(answer(503, { error: { code: "db", message: "The database is down." } }));
    await session.restore();
    expect(session.status).toBe("out");
    expect(session.error).toBe("The database is down.");
  });

  it("a token stored before the cookie is exchanged for it at startup and deleted", async () => {
    localStorage.setItem("osct-editor-session", "old-token");
    fetchMock.mockResolvedValueOnce(answer(200, { user: USER, csrfToken: "csrf-x" }));
    await session.restore();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/cookie");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer old-token");
    expect(session.status).toBe("in");
    expect(getSession()).toEqual({ csrfToken: "csrf-x", email: USER.email });
    expect(localStorage.getItem("osct-editor-session")).toBeNull();
  });

  it("a stored token that no longer holds is deleted, then the cookie is asked – signed out quietly", async () => {
    localStorage.setItem("osct-editor-session", "old-token");
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());
    await session.restore();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/cookie", "/api/user"]);
    expect(session.status).toBe("out");
    expect(session.notice).toBeNull();
    expect(localStorage.getItem("osct-editor-session")).toBeNull();
  });

  it("signs in with a code: the CSRF token is kept, the note goes, nothing is stored", async () => {
    session.status = "out";
    session.notice = SESSION_ENDED;
    session.pending = { email: USER.email, requestId: "r1" };
    fetchMock.mockResolvedValueOnce(answer(200, { csrfToken: "csrf-2", user: USER }));
    await session.confirmCode("123456");
    expect(session.status).toBe("in");
    expect(getSession()).toEqual({ csrfToken: "csrf-2", email: USER.email });
    expect(session.notice).toBeNull();
    expect(session.pending).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("a wrong password is an error on the form, not a session end", async () => {
    session.status = "out";
    fetchMock.mockResolvedValueOnce(answer(401, { error: { code: "invalid-credentials", message: "Email or password is not right." } }));
    await session.signInPassword(USER.email, "wrong");
    expect(session.status).toBe("out");
    expect(session.error).toBe("Email or password is not right.");
    expect(session.notice).toBeNull();
  });

  it("a 401 mid-session goes back to sign-in with the note", async () => {
    setSession(KEY);
    session.user = USER;
    session.status = "in";
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api("GET", "/editor/books/osct")).rejects.toMatchObject({ status: 401 });
    expect(session.status).toBe("out");
    expect(session.user).toBeNull();
    expect(session.notice).toBe(SESSION_ENDED);
    expect(getSession()).toBeNull();
  });

  it("a reload of the signed-in user that answers 401 ends the session with the note", async () => {
    setSession(KEY);
    session.user = USER;
    session.status = "in";
    fetchMock.mockResolvedValueOnce(unauthorized());
    await session.restore(true);
    expect(session.status).toBe("out");
    expect(session.notice).toBe(SESSION_ENDED);
    expect(getSession()).toBeNull();
  });

  it("signing out sends the CSRF token and forgets the session even when the API cannot be reached, without a note", async () => {
    setSession(KEY);
    session.user = USER;
    session.status = "in";
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await session.signOut();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("X-CSRF-Token")).toBe("csrf-1");
    expect(session.status).toBe("out");
    expect(getSession()).toBeNull();
    expect(session.notice).toBeNull();
  });
});
