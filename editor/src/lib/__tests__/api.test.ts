import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, downloadUsersCsv, getToken, me, onSessionEnd, setToken, signInWithPassword, uploadAsset, verifyCode } from "../api";

/** A JSON answer as the API sends it */
const answer = (status: number, body: unknown): Response =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const unauthorized = () => answer(401, { error: { code: "unauthorized", message: "Session expired." } });

describe("api()", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const ended = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    onSessionEnd(ended);
    setToken("token-1");
  });

  afterEach(() => {
    fetchMock.mockReset();
    ended.mockReset();
    onSessionEnd(null);
    setToken(null);
    vi.unstubAllGlobals();
  });

  it("sends the stored token and the JSON body, and answers the JSON", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { ok: true }));
    await expect(api("POST", "/editor/books/osct/spreads", { id: "s1" })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/editor/books/osct/spreads");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-1");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ id: "s1" }));
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
    expect(getToken()).toBe("token-1");
  });

  it("an answer that is no JSON still becomes an ApiError", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    await expect(api("GET", "/editor/books")).rejects.toMatchObject({ status: 502, code: "unknown", message: "502 Bad Gateway" });
  });

  it("a 401 to the stored token ends the session: the token is cleared and the session hears it", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api("GET", "/editor/books/osct")).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("several 401s at once end it once", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await Promise.allSettled([api("GET", "/editor/books"), api("GET", "/editor/books/osct")]);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("a 401 without a stored token is only 'not signed in'", async () => {
    setToken(null);
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api("GET", "/editor/books")).rejects.toMatchObject({ status: 401 });
    expect(ended).not.toHaveBeenCalled();
  });

  it("a 401 to a token replaced meanwhile (a new sign-in) leaves the new session alone", async () => {
    fetchMock.mockImplementationOnce(async () => {
      setToken("token-2");
      return unauthorized();
    });
    await expect(api("GET", "/editor/books")).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBe("token-2");
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
    expect(getToken()).toBe("token-1");
  });

  it("an upload's 401 ends the session too", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(uploadAsset("osct", new File(["x"], "dot.png", { type: "image/png" }))).rejects.toMatchObject({ status: 401 });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("the CSV download's 401 ends the session too", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(downloadUsersCsv(true)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/users.csv?newsletter=1");
    expect(ended).toHaveBeenCalledTimes(1);
  });
});
