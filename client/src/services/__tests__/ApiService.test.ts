import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApiService } from "../ApiService";

const api = () => new ApiService("https://api.example/api");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const respond = (response: Response | Error) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return response;
  });

/** The `ApiError` a call rejects with */
const failure = async (call: Promise<unknown>): Promise<ApiError> => {
  const error = await call.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
};

const isUser = (data: unknown): data is { user: { email: string } } =>
  typeof data === "object" && data !== null && typeof (data as { user?: { email?: unknown } }).user?.email === "string";

describe("ApiService", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("is disabled without a base URL", () => {
    expect(new ApiService("").isEnabled()).toBe(false);
    expect(api().isEnabled()).toBe(true);
  });

  it("sends JSON with the session cookie (same origin) and returns the parsed response", async () => {
    const fetch = respond(json(200, { ok: true }));
    expect(await api().request("PATCH", "/user", { body: { a: 1 } })).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example/api/user");
    expect(init).toMatchObject({ method: "PATCH", body: '{"a":1}', cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" } });
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("a Bearer token only when one is given (the exchange of a token stored before the cookie)", async () => {
    const fetch = respond(json(200, { ok: true }));
    const service = api();
    service.setCsrfToken("csrf-1");
    await service.request("POST", "/auth/cookie", { token: "t1" });
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer t1" });
  });

  it("sends neither a body nor a token header when there is none", async () => {
    const fetch = respond(json(200, {}));
    await api().request("GET", "/user");
    expect(fetch.mock.calls[0][1]).toMatchObject({ body: undefined, headers: {}, credentials: "same-origin" });
  });

  it("every write carries the CSRF token it holds (memory only), a read none", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, {}));
    const service = api();
    service.setCsrfToken("csrf-1");
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) await service.request(method, "/user");
    expect(fetch.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)["X-CSRF-Token"] ?? null)).toEqual([null, "csrf-1", "csrf-1", "csrf-1", "csrf-1"]);
    service.setCsrfToken(null);
    await service.request("PUT", "/progress/osct", { body: {} });
    expect((fetch.mock.calls.at(-1)?.[1]?.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
  });

  it("a write refused 403 csrf reads the token from GET /user and is sent once more", async () => {
    const answers = [json(403, { error: { code: "csrf" } }), json(200, { user: { email: "a@b.c" }, csrfToken: "csrf-new" }), json(200, { updatedAt: 1 })];
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => answers.shift()!);
    expect(await api().request("PUT", "/progress/osct", { body: { record: {} } })).toEqual({ updatedAt: 1 });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method, (init?.headers as Record<string, string>)["X-CSRF-Token"] ?? null])).toEqual([
      ["https://api.example/api/progress/osct", "PUT", null],
      ["https://api.example/api/user", "GET", null],
      ["https://api.example/api/progress/osct", "PUT", "csrf-new"],
    ]);
  });

  it("a 403 csrf again is the answer; a 401 while renewing is thrown on (no session: sign out)", async () => {
    const answers = [json(403, { error: { code: "csrf" } }), json(200, { user: {}, csrfToken: "x" }), json(403, { error: { code: "csrf" } })];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => answers.shift()!);
    expect(await failure(api().request("PATCH", "/user", { body: {} }))).toMatchObject({ status: 403, code: "csrf" });
    vi.restoreAllMocks();
    const gone = [json(403, { error: { code: "csrf" } }), json(401, { error: { code: "unauthorized" } })];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => gone.shift()!);
    expect(await failure(api().request("PATCH", "/user", { body: {} }))).toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("204 No Content returns null without reading a body", async () => {
    respond(new Response(null, { status: 204 }));
    expect(await api().request("POST", "/auth/logout")).toBeNull();
  });

  it("an unreachable server is `offline` with status 0", async () => {
    respond(new TypeError("Failed to fetch"));
    const error = await failure(api().request("GET", "/user"));
    expect(error).toMatchObject({ status: 0, code: "offline", data: undefined });
  });

  it("an error response carries the API's code, status and full body", async () => {
    const body = { error: { code: "too-many-requests", message: "Wait.", retryAfter: 60 } };
    respond(json(429, body));
    const error = await failure(api().request("POST", "/auth/request", { body: {} }));
    expect(error).toMatchObject({ status: 429, code: "too-many-requests", data: body });
    expect(error.message).toBe("too-many-requests");
  });

  it("an error response without a readable code is `server-error`", async () => {
    for (const body of [{ error: { code: 42 } }, { error: "nope" }, null, ["x"]]) {
      respond(json(500, body));
      const error = await failure(api().request("GET", "/user"));
      expect(error).toMatchObject({ status: 500, code: "server-error", data: body });
      vi.restoreAllMocks();
    }
  });

  it("a body that is not JSON is `server-error` with the response's status", async () => {
    respond(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(await failure(api().request("GET", "/user"))).toMatchObject({ status: 502, code: "server-error" });
    respond(new Response("not json", { status: 200 }));
    expect(await failure(api().request("GET", "/user"))).toMatchObject({ status: 200, code: "server-error" });
  });

  it("requestAs returns a response of the expected shape", async () => {
    respond(json(200, { user: { email: "reader@example.com" } }));
    const { user } = await api().requestAs(isUser, "GET", "/user");
    expect(user.email).toBe("reader@example.com");
  });

  it("requestAs refuses a response of the wrong shape as `server-error` (502)", async () => {
    respond(json(200, { user: null }));
    expect(await failure(api().requestAs(isUser, "GET", "/user"))).toMatchObject({ status: 502, code: "server-error", data: { user: null } });
    // 204 has no body: a call that expects one fails the same way
    respond(new Response(null, { status: 204 }));
    expect(await failure(api().requestAs(isUser, "GET", "/user"))).toMatchObject({ status: 502, code: "server-error", data: null });
  });

  it("requestAs passes an API error on unchanged", async () => {
    respond(json(401, { error: { code: "unauthorized" } }));
    expect(await failure(api().requestAs(isUser, "GET", "/user"))).toMatchObject({ status: 401, code: "unauthorized" });
  });
});
