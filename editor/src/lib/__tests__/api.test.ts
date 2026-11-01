import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  authFetch,
  downloadUsersCsv,
  errorText,
  exchangeStoredToken,
  getBook,
  getSession,
  logout,
  me,
  onSessionEnd,
  putEntity,
  replaceAsset,
  setSession,
  signInWithPassword,
  uploadAsset,
  verifyCode,
} from "../api";

/** A JSON answer as the API sends it */
const answer = (status: number, body: unknown): Response =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const unauthorized = () => answer(401, { error: { code: "unauthorized", message: "Session expired." } });
const csrfRefused = () => answer(403, { error: { code: "csrf", message: "The CSRF token is missing or wrong – reload the page." } });

/** The signed-in session as the editor holds it: the CSRF token and whose session it is – never the session token */
const KEY = { csrfToken: "csrf-1", email: "editor@example.test" };
const USER = { email: "editor@example.test", language: "en", options: {}, hasPassword: false, roles: ["reader", "editor"], createdAt: "2026-01-01T00:00:00Z" };

const headersOf = (init: RequestInit | undefined) => new Headers(init?.headers);

describe("api() – the cookie session (#207)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const ended = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    onSessionEnd(ended);
    setSession(KEY);
  });

  afterEach(() => {
    fetchMock.mockReset();
    ended.mockReset();
    onSessionEnd(null);
    setSession(null);
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("a write goes with the cookie (same origin) and the CSRF token, the JSON body – never an Authorization header", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { ok: true }));
    await expect(api("POST", "/editor/books/osct/spreads", { id: "s1" })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/editor/books/osct/spreads");
    expect(init?.credentials).toBe("same-origin");
    expect(headersOf(init).get("X-CSRF-Token")).toBe("csrf-1");
    expect(headersOf(init).has("Authorization")).toBe(false);
    expect(headersOf(init).get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ id: "s1" }));
  });

  it("a read goes with the cookie, without the CSRF token", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { books: [] }));
    await api("GET", "/editor/books");
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe("same-origin");
    expect(headersOf(init).has("X-CSRF-Token")).toBe(false);
    expect(headersOf(init).has("Authorization")).toBe(false);
  });

  it("PUT, PATCH and DELETE carry the CSRF token too; signed out, nothing does", async () => {
    fetchMock.mockImplementation(async () => answer(200, {}));
    await api("PUT", "/editor/books/osct/passes", { passes: null });
    await api("PATCH", "/user", { language: "en" });
    await api("DELETE", "/user/tokens/x");
    setSession(null);
    await api("POST", "/auth/request", { email: "a@example.com" });
    expect(fetchMock.mock.calls.map(([, init]) => headersOf(init).get("X-CSRF-Token"))).toEqual(["csrf-1", "csrf-1", "csrf-1", null]);
  });

  it("uploads and the engine's draft fetch take the same path", async () => {
    fetchMock.mockImplementation(async () => answer(201, { asset: { id: "a1" } }));
    await uploadAsset("osct", new File(["x"], "dot.png", { type: "image/png" }));
    await replaceAsset("osct", "a1", new File(["y"], "dot.png", { type: "image/png" }));
    await authFetch("/api/editor/books/osct/draft/latest.json");
    const [[, upload], [, replace], [, draft]] = fetchMock.mock.calls;
    expect([upload?.credentials, replace?.credentials, draft?.credentials]).toEqual(["same-origin", "same-origin", "same-origin"]);
    expect(headersOf(upload).get("X-CSRF-Token")).toBe("csrf-1");
    expect(headersOf(upload).get("X-File-Name")).toBe("dot.png");
    expect(headersOf(replace).get("X-CSRF-Token")).toBe("csrf-1");
    expect(headersOf(draft).has("X-CSRF-Token")).toBe(false);
  });

  it("the sign-ins ask for the cookie and answer the CSRF token; the editor stores nothing", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { csrfToken: "csrf-2", user: USER }));
    await expect(verifyCode("r1", "123456")).resolves.toEqual({ csrfToken: "csrf-2", user: USER });
    fetchMock.mockResolvedValueOnce(answer(200, { csrfToken: "csrf-3", user: USER }));
    await signInWithPassword(USER.email, "secret");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ requestId: "r1", code: "123456", session: "cookie" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ session: "cookie" });
    expect(localStorage.length).toBe(0);
  });

  it("the sign-out is a write: it carries the CSRF token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await logout();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/logout");
    expect(headersOf(init).get("X-CSRF-Token")).toBe("csrf-1");
  });

  it("a 403 csrf renews the token from GET /user and sends the write once more", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfRefused())
      .mockResolvedValueOnce(answer(200, { user: USER, csrfToken: "csrf-new" }))
      .mockResolvedValueOnce(answer(200, { ref: "x", entity: {} }));
    await expect(putEntity("osct", "x", { type: "group", assets: [] })).resolves.toEqual({ ref: "x", entity: {} });
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? "GET", headersOf(init).get("X-CSRF-Token")])).toEqual([
      ["/api/editor/books/osct/entities/x", "PUT", "csrf-1"],
      ["/api/user", "GET", null],
      ["/api/editor/books/osct/entities/x", "PUT", "csrf-new"],
    ]);
    expect(getSession()?.csrfToken).toBe("csrf-new");
    expect(ended).not.toHaveBeenCalled();
  });

  it("a 403 csrf again after the renewal is the answer – sent once more, no more", async () => {
    fetchMock.mockResolvedValueOnce(csrfRefused()).mockResolvedValueOnce(answer(200, { user: USER, csrfToken: "csrf-new" })).mockResolvedValueOnce(csrfRefused());
    await expect(api("PATCH", "/user", { language: "en" })).rejects.toMatchObject({ status: 403, code: "csrf" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("when the cookie now belongs to another person, the editor's session ends", async () => {
    fetchMock.mockResolvedValueOnce(csrfRefused()).mockResolvedValueOnce(answer(200, { user: { ...USER, email: "reader@example.test" }, csrfToken: "csrf-other" }));
    await expect(api("PATCH", "/user", { language: "en" })).rejects.toMatchObject({ status: 403, code: "csrf" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getSession()).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("a 403 that is no csrf is an answer as any other", async () => {
    fetchMock.mockResolvedValueOnce(answer(403, { error: { code: "not-for-ai", message: "No." } }));
    await expect(api("PATCH", "/user", {})).rejects.toMatchObject({ status: 403, code: "not-for-ai" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers undefined for a 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api("DELETE", "/editor/books/osct/assets/x")).resolves.toBeUndefined();
  });

  it("throws the server's error as ApiError with its code and details", async () => {
    fetchMock.mockResolvedValueOnce(answer(409, { error: { code: "other-book", message: "Another book is live.", current: { book: "demo" } } }));
    const error = await api("POST", "/editor/books/osct/publish").catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "other-book", message: "Another book is live.", details: { current: { book: "demo" } } });
    expect(ended).not.toHaveBeenCalled();
    expect(getSession()).toEqual(KEY);
  });

  it("an answer that is no JSON still becomes an ApiError", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    await expect(api("GET", "/editor/books")).rejects.toMatchObject({ status: 502, code: "unknown", message: "502 Bad Gateway" });
  });

  it("a 401 while signed in ends the session: it is forgotten and the session hears it", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api("GET", "/editor/books/osct")).rejects.toMatchObject({ status: 401 });
    expect(getSession()).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("several 401s at once end it once", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await Promise.allSettled([api("GET", "/editor/books"), api("GET", "/editor/books/osct")]);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("a 401 signed out is only 'not signed in'", async () => {
    setSession(null);
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api("GET", "/editor/books")).rejects.toMatchObject({ status: 401 });
    expect(ended).not.toHaveBeenCalled();
  });

  it("a 401 to a session replaced meanwhile (a new sign-in) leaves the new session alone", async () => {
    const next = { csrfToken: "csrf-2", email: USER.email };
    fetchMock.mockImplementationOnce(async () => {
      setSession(next);
      return unauthorized();
    });
    await expect(api("GET", "/editor/books")).rejects.toMatchObject({ status: 401 });
    expect(getSession()).toEqual(next);
    expect(ended).not.toHaveBeenCalled();
  });

  it("the sign-in calls and the startup check answer a 401 without ending the session", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { error: { code: "invalid-credentials", message: "Email or password is not right." } }));
    await expect(signInWithPassword("a@example.com", "wrong")).rejects.toMatchObject({ status: 401, code: "invalid-credentials" });
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(verifyCode("r1", "123456")).rejects.toMatchObject({ status: 401 });
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(me()).rejects.toMatchObject({ status: 401 });
    expect(ended).not.toHaveBeenCalled();
    expect(getSession()).toEqual(KEY);
  });

  it("an upload's 401 ends the session too", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(uploadAsset("osct", new File(["x"], "dot.png", { type: "image/png" }))).rejects.toMatchObject({ status: 401 });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("the CSV download goes with the cookie; its 401 ends the session too", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(downloadUsersCsv(true)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/users.csv?newsletter=1");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("same-origin");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("the CSV download's error keeps the server's details, as every call's does", async () => {
    fetchMock.mockResolvedValueOnce(answer(403, { error: { code: "forbidden", message: "Not allowed.", role: "admin" } }));
    await expect(downloadUsersCsv(false)).rejects.toMatchObject({ status: 403, code: "forbidden", message: "Not allowed.", details: { role: "admin" } });
  });
});

describe("exchangeStoredToken – a token stored before the cookie (#207, temporary)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));

  afterEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("nothing stored: asks nothing", async () => {
    await expect(exchangeStoredToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the stored token once as Bearer to POST /auth/cookie, then deletes it", async () => {
    localStorage.setItem("osct-editor-session", "old-token");
    fetchMock.mockResolvedValueOnce(answer(200, { csrfToken: "csrf-x", user: USER }));
    await expect(exchangeStoredToken()).resolves.toEqual({ csrfToken: "csrf-x", user: USER });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/cookie");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(headersOf(init).get("Authorization")).toBe("Bearer old-token");
    expect(localStorage.getItem("osct-editor-session")).toBeNull();
  });

  it("a token that no longer holds is deleted: sign in as usual", async () => {
    localStorage.setItem("osct-editor-session", "old-token");
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(exchangeStoredToken()).resolves.toBeNull();
    expect(localStorage.getItem("osct-editor-session")).toBeNull();
  });

  it("the API out of reach keeps it for the next start", async () => {
    localStorage.setItem("osct-editor-session", "old-token");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(exchangeStoredToken()).resolves.toBeNull();
    expect(localStorage.getItem("osct-editor-session")).toBe("old-token");
  });
});

describe("getBook – the book's tree, read once", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const tree = (title: string) => ({ book: { id: "osct", title }, spreads: [], unassigned: [] });
  const reads = () => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET").length;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setSession(KEY);
  });

  afterEach(() => {
    fetchMock.mockReset();
    setSession(null);
    vi.unstubAllGlobals();
  });

  it("the stage, the environment and the top bar share one read", async () => {
    fetchMock.mockImplementation(async () => answer(200, tree("One")));
    const [a, b, c] = await Promise.all([getBook("osct"), getBook("osct"), getBook("osct")]);
    expect(reads()).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    await getBook("osct");
    expect(reads()).toBe(1);
  });

  it("a write to the book drops it – the next read asks the API, answered or refused", async () => {
    fetchMock.mockImplementation(async (_url, init) => (init?.method === "PUT" ? answer(200, { ref: "x", entity: {} }) : answer(200, tree("One"))));
    await getBook("osct");
    await putEntity("osct", "x", { type: "group", assets: [] });
    await getBook("osct");
    expect(reads()).toBe(2);
    fetchMock.mockImplementation(async (_url, init) => (init?.method === "PUT" ? answer(400, { error: { code: "invalid-entity", message: "No." } }) : answer(200, tree("Two"))));
    await expect(putEntity("osct", "x", { type: "group", assets: [] })).rejects.toBeInstanceOf(ApiError);
    expect((await getBook("osct")).book.title).toBe("Two");
    expect(reads()).toBe(3);
  });

  it("a write to another book, a failed read, fresh and a new session", async () => {
    fetchMock.mockImplementation(async (_url, init) => (init?.method === "PUT" ? answer(200, {}) : answer(200, tree("One"))));
    await getBook("osct");
    await putEntity("demo", "x", { type: "group", assets: [] });
    await getBook("osct");
    expect(reads()).toBe(1);
    await getBook("osct", { fresh: true });
    expect(reads()).toBe(2);
    setSession({ csrfToken: "csrf-2", email: "editor@example.test" });
    await getBook("osct");
    expect(reads()).toBe(3);
    fetchMock.mockImplementationOnce(async () => answer(502, null));
    await expect(getBook("demo")).rejects.toMatchObject({ status: 502 });
    await getBook("demo");
    expect(reads()).toBe(5);
  });
});

describe("errorText – an error as a line for the page", () => {
  it("the API's message, with its code when asked; an error's message; anything else as text", () => {
    const refused = new ApiError(409, "other-book", "Another book is live.");
    expect(errorText(refused)).toBe("Another book is live.");
    expect(errorText(refused, { code: true })).toBe("Another book is live. (other-book)");
    expect(errorText(new TypeError("Failed to fetch"), { code: true })).toBe("Failed to fetch");
    expect(errorText("plain")).toBe("plain");
  });
});
