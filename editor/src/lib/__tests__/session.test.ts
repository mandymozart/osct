import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/paths", () => ({ resolve: (path: string) => `/editor/${path.replace(/^\//, "")}` }));

const { api, getToken, setToken } = await import("../api");
const { session, SESSION_ENDED } = await import("../session.svelte");

const answer = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const unauthorized = () => answer(401, { error: { code: "unauthorized", message: "Session expired." } });
const USER = { email: "editor@example.test", language: "en", options: {}, hasPassword: false, roles: ["reader", "editor"], createdAt: "2026-01-01T00:00:00Z" };

describe("session", () => {
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
    setToken(null);
    vi.unstubAllGlobals();
  });

  it("without a stored token it is signed out, asking nothing", async () => {
    await session.restore();
    expect(session.status).toBe("out");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores a stored token that still holds", async () => {
    setToken("token-1");
    fetchMock.mockResolvedValueOnce(answer(200, { user: USER }));
    await session.restore();
    expect(session.status).toBe("in");
    expect(session.isEditor).toBe(true);
    expect(session.isAdmin).toBe(false);
  });

  it("a stored token that no longer holds signs out quietly at startup", async () => {
    setToken("old");
    fetchMock.mockResolvedValueOnce(unauthorized());
    await session.restore();
    expect(session.status).toBe("out");
    expect(getToken()).toBeNull();
    expect(session.error).toBeNull();
    expect(session.notice).toBeNull();
  });

  it("a startup check that fails otherwise keeps the token and tells why", async () => {
    setToken("token-1");
    fetchMock.mockResolvedValueOnce(answer(503, { error: { code: "db", message: "The database is down." } }));
    await session.restore();
    expect(session.status).toBe("out");
    expect(getToken()).toBe("token-1");
    expect(session.error).toBe("The database is down.");
  });

  it("signs in with a code: the token is stored, the note goes", async () => {
    session.status = "out";
    session.notice = SESSION_ENDED;
    session.pending = { email: USER.email, requestId: "r1" };
    fetchMock.mockResolvedValueOnce(answer(200, { session: "token-2", user: USER }));
    await session.confirmCode("123456");
    expect(session.status).toBe("in");
    expect(getToken()).toBe("token-2");
    expect(session.notice).toBeNull();
    expect(session.pending).toBeNull();
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
    setToken("token-1");
    session.user = USER;
    session.status = "in";
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api("GET", "/editor/books/osct")).rejects.toMatchObject({ status: 401 });
    expect(session.status).toBe("out");
    expect(session.user).toBeNull();
    expect(session.notice).toBe(SESSION_ENDED);
    expect(getToken()).toBeNull();
  });

  it("a reload of the signed-in user that answers 401 ends the session with the note", async () => {
    setToken("token-1");
    session.user = USER;
    session.status = "in";
    fetchMock.mockResolvedValueOnce(unauthorized());
    await session.restore(true);
    expect(session.status).toBe("out");
    expect(session.notice).toBe(SESSION_ENDED);
    expect(getToken()).toBeNull();
  });

  it("signing out clears the token even when the API cannot be reached, without a note", async () => {
    setToken("token-1");
    session.user = USER;
    session.status = "in";
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await session.signOut();
    expect(session.status).toBe("out");
    expect(getToken()).toBeNull();
    expect(session.notice).toBeNull();
  });
});
