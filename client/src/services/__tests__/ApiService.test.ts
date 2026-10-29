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

  it("sends JSON with the session token and returns the parsed response", async () => {
    const fetch = respond(json(200, { ok: true }));
    expect(await api().request("PATCH", "/user", { body: { a: 1 }, token: "t1" })).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example/api/user");
    expect(init).toMatchObject({
      method: "PATCH",
      body: '{"a":1}',
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t1" },
    });
  });

  it("sends neither a body nor a token header when there is none", async () => {
    const fetch = respond(json(200, {}));
    await api().request("GET", "/user");
    expect(fetch.mock.calls[0][1]).toMatchObject({ body: undefined, headers: {} });
  });

  it("204 No Content returns null without reading a body", async () => {
    respond(new Response(null, { status: 204 }));
    expect(await api().request("POST", "/auth/logout", { token: "t1" })).toBeNull();
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
    const { user } = await api().requestAs(isUser, "GET", "/user", { token: "t1" });
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
