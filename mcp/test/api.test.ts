import { describe, expect, it } from "vitest";
import { ApiError, OsctApi } from "../src/api.ts";
import { fakeFetch } from "./helpers.ts";

describe("OsctApi – the API over HTTP", () => {
  it("sends JSON with the bearer token and parses the answer", async () => {
    const { api, seen } = fakeFetch(r => (r.path === "/editor/books/osct/entities/x" && r.method === "PUT" ? { json: { ref: "x", entity: r.body } } : undefined));
    const result = await api("secret").call<{ ref: string }>("PUT", "/editor/books/osct/entities/x", { type: "group", assets: [] });
    expect(result.ref).toBe("x");
    expect(seen[0].headers.Authorization).toBe("Bearer secret");
    expect(seen[0].headers["Content-Type"]).toBe("application/json");
    expect(seen[0].body).toEqual({ type: "group", assets: [] });
  });

  it("sends no Authorization header without a token, and none for a 204 body", async () => {
    const { api, seen } = fakeFetch(r => (r.method === "DELETE" ? { status: 204 } : { json: { ok: true } }));
    const client = api("");
    expect(client.hasToken).toBe(false);
    await client.call("GET", "/health");
    expect(seen[0].headers.Authorization).toBeUndefined();
    expect(seen[0].headers["Content-Type"]).toBeUndefined();
    expect(await client.call("DELETE", "/editor/books/osct/entries/e")).toBeUndefined();
  });

  it("uploads bytes as the body with X-File-Name", async () => {
    const { api, seen } = fakeFetch(() => ({ status: 201, json: { asset: { id: "a" } } }));
    const bytes = new Uint8Array([1, 2, 3]);
    await api().upload("POST", "/editor/books/osct/assets", bytes, "Dot.png");
    expect(seen[0].headers["X-File-Name"]).toBe("Dot.png");
    expect(seen[0].headers["Content-Type"]).toBe("application/octet-stream");
    expect(seen[0].rawBody).toBe(bytes);
  });

  it("turns the API's { error: { code, message, …fields } } into an ApiError with the extra fields", async () => {
    const { api } = fakeFetch(() => ({ status: 409, json: { error: { code: "unknown-components", message: "Nodes use tint.", components: ["tint"] } } }));
    const error = await api().call<never>("POST", "/editor/books/osct/publish", { env: "local" }).catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.code, error.message, error.details]).toEqual([409, "unknown-components", "Nodes use tint.", { components: ["tint"] }]);
  });

  it("answers a body that is no JSON and an API that is down with codes of its own", async () => {
    const { api } = fakeFetch(() => ({ status: 502, text: "<html>Bad gateway</html>" }));
    const error = await api().call<never>("GET", "/user").catch((e: unknown) => e as ApiError);
    expect([error.status, error.code]).toEqual([502, "unknown"]);
    const down = new OsctApi("http://127.0.0.1:1/api", "t", async () => {
      throw new TypeError("fetch failed");
    });
    const network = await down.call<never>("GET", "/user").catch((e: unknown) => e as ApiError);
    expect([network.status, network.code]).toEqual([0, "network"]);
    expect(network.message).toContain("not reachable");
  });

  it("setToken changes the token for the next call", async () => {
    const { api, seen } = fakeFetch(() => ({ json: {} }));
    const client = api("");
    client.setToken("fresh");
    await client.call("GET", "/user");
    expect(seen[0].headers.Authorization).toBe("Bearer fresh");
  });
});
