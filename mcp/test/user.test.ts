import { describe, expect, it, vi } from "vitest";
import { editorUrlFor, loadConfig } from "../src/config.ts";
import { fetchUser, servicesOf } from "../src/services.ts";
import { fakeFetch, recorder, type Seen } from "./helpers.ts";

// `createUserServer` makes a real McpServer; the recorder stands in for it here, so the module is loaded with the
// McpServer swapped for the recorder's double
const rec = recorder();
/** the double the next McpServer returns – `rec` unless a test swaps in a fresh one */
let current = rec;
vi.mock("@modelcontextprotocol/server", () => ({ McpServer: class { constructor() { return current.server; } } }));
const { createUserServer } = await import("../src/user.ts");

const CONFIG = { api: "http://api.test/api", editor: "http://localhost:5175/editor", token: "", tokenSource: "none" as const, local: false };
const USERS: Record<string, { email: string; roles: string[] }> = {
  "tok-editor": { email: "editor@example.com", roles: ["reader", "editor"] },
  "tok-reader": { email: "reader@example.com", roles: ["reader"] },
};
/** an AI connection's token, made on the editor's books page – GET /user names it */
const OSCT_TOKEN = "osct_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const AI_TOKEN = { id: "t1", name: "Claude on my laptop", prefix: "osct_abcd…", createdAt: "2026-10-30T10:00:00+00:00", lastUsedAt: "2026-10-30T10:05:00+00:00", expiresAt: "2027-04-30T10:00:00+00:00", expired: false };

function accountsApi(seen: Seen) {
  const { method, path, headers } = seen;
  const token = headers.Authorization?.replace("Bearer ", "");
  if (token === "osct_expired") return { status: 401, json: { error: { code: "token-expired", message: "This token has expired." } } };
  if (token === OSCT_TOKEN) {
    if (path === "/user") return { json: { user: { ...USERS["tok-editor"], language: "en" }, token: AI_TOKEN } };
    if (method === "POST" && path === "/editor/books/osct/publish") return { status: 403, json: { error: { code: "not-for-ai", message: "Publishing is not for an AI connection." } } };
  }
  if (path === "/user") return token && USERS[token] ? { json: { user: { ...USERS[token], language: "en" } } } : { status: 401, json: { error: { code: "unauthorized", message: "Sign in." } } };
  if (method === "POST" && path === "/auth/request") return { status: 202, json: { requestId: "req-1", expiresAt: "later" } };
  if (method === "POST" && path === "/auth/verify") {
    const { code } = seen.body as { code: string };
    if (code !== "123456") return { status: 400, json: { error: { code: "invalid-code", message: "Wrong code." } } };
    return { json: { session: "tok-editor", user: USERS["tok-editor"], created: false } };
  }
  if (path === "/editor/books") return { json: { books: [] } };
  return undefined;
}

describe("config", () => {
  it("defaults to the local dev API and editor; a deployed API's editor sits next to it", () => {
    const local = loadConfig({});
    expect(local).toEqual({ api: "http://127.0.0.1:8080/api", editor: "http://localhost:5175/editor", token: "", tokenSource: "none", local: true });
    const remote = loadConfig({ OSCT_API_URL: "https://osct.porschuetz.de/api/", OSCT_EDITOR_TOKEN: " t " });
    expect(remote).toMatchObject({ api: "https://osct.porschuetz.de/api", editor: "https://osct.porschuetz.de/editor", token: "t", tokenSource: "env", local: false });
    expect(loadConfig({ OSCT_EDITOR_URL: "http://localhost:5185/editor/" }).editor).toBe("http://localhost:5185/editor");
    expect(editorUrlFor("nonsense")).toBe("http://localhost:5175/editor");
  });
});

describe("services", () => {
  it("the role editor opens the editor's tools; admin is shown only", () => {
    expect(servicesOf(["reader", "editor"])).toEqual({ editor: true, admin: false });
    expect(servicesOf(["reader", "admin"])).toEqual({ editor: false, admin: true });
    expect(servicesOf([])).toEqual({ editor: false, admin: false });
  });

  it("fetchUser reads GET /user, null without a token", async () => {
    const { api } = fakeFetch(accountsApi);
    expect(await fetchUser(api(""))).toBeNull();
    expect(await fetchUser(api("tok-editor"))).toEqual({ email: "editor@example.com", roles: ["reader", "editor"], language: "en", token: null });
    await expect(fetchUser(api("tok-dead"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("the user's server", () => {
  it("without a token: whoami and the sign-in pair only; a sign-in with the editor role opens the tools and tells the client", async () => {
    const fake = fakeFetch(accountsApi);
    createUserServer(CONFIG, fake.api(""), null);
    expect([...rec.tools.keys()]).toEqual(["whoami", "sign_in_request", "sign_in_verify"]);
    expect(rec.resources.size).toBe(0);

    const who = await rec.call("whoami");
    expect(who.data.user).toBeNull();
    expect(who.data.hint).toContain("sign_in_request");

    const request = await rec.call("sign_in_request", { email: "editor@example.com" });
    expect(request.ok).toBe(true);
    expect(request.data.requestId).toBe("req-1");
    expect(fake.seen.at(-1)!.body).toEqual({ email: "editor@example.com", language: "en" });

    const wrong = await rec.call("sign_in_verify", { requestId: "req-1", code: "000000" });
    expect(wrong.ok).toBe(false);
    expect(wrong.data.error.code).toBe("invalid-code");
    expect(rec.tools.has("list_books")).toBe(false);

    const verified = await rec.call("sign_in_verify", { requestId: "req-1", code: "123 456" });
    expect(verified.ok).toBe(true);
    expect(verified.raw).not.toContain("tok-editor");
    expect(verified.data.user.email).toBe("editor@example.com");
    expect(verified.data.opened).toContain("listed now");
    expect(rec.listChanged).toBe(1);
    expect(rec.tools.has("list_books")).toBe(true);
    expect(rec.tools.has("put_plugin")).toBe(true);
    expect(rec.prompts.has("editor")).toBe(true);
    expect(rec.resources.has("content-model")).toBe(true);

    // the token is kept for the process: the editor's calls carry it
    const books = await rec.call("list_books");
    expect(books.ok).toBe(true);
    expect(fake.seen.at(-1)!.headers.Authorization).toBe("Bearer tok-editor");
    const again = await rec.call("whoami");
    expect(again.data.user.roles).toContain("editor");
    expect(again.data.confirm).toContain("draft");
  });

  it("with an editor's token the tools are there from the start", () => {
    const r = recorder();
    vi.mocked; // the module-level mock answers `rec`; a second server reuses the same double, so check the count only
    const fake = fakeFetch(accountsApi);
    const before = rec.tools.size;
    expect(() => createUserServer({ ...CONFIG, token: "tok-editor", tokenSource: "env" }, fake.api("tok-editor"), { email: "editor@example.com", roles: ["reader", "editor"], language: "en", token: null })).toThrow(/registered twice/);
    expect(rec.tools.size).toBe(before);
    expect(r.tools.size).toBe(0);
  });

  it("a signed-in reader gets whoami's hint and no editor tools", async () => {
    const r = recorder();
    const fake = fakeFetch(accountsApi);
    // the module mock returns the shared `rec`; register through a fresh recorder by hand instead
    const { registerContentTools } = await import("../src/content.ts");
    registerContentTools(r.server, fake.api("tok-reader"), { editor: CONFIG.editor });
    expect(servicesOf(USERS["tok-reader"].roles).editor).toBe(false);
    const forbidden = fakeFetch(() => ({ status: 403, json: { error: { code: "forbidden", message: "Not allowed.", role: "editor" } } }));
    const r2 = recorder();
    registerContentTools(r2.server, forbidden.api("tok-reader"), { editor: CONFIG.editor });
    const result = await r2.call("list_books");
    expect(result.data.error.hint).toContain("admin grants it");
  });
});

describe("signed in with an AI connection's token (#142)", () => {
  it("fetchUser names the token; whoami says it is signed in with it, never shows it, and the tools are there from the start", async () => {
    current = recorder();
    const fake = fakeFetch(accountsApi);
    const api = fake.api(OSCT_TOKEN);
    const user = await fetchUser(api);
    expect(user).toEqual({ email: "editor@example.com", roles: ["reader", "editor"], language: "en", token: { name: "Claude on my laptop", prefix: "osct_abcd…", expiresAt: AI_TOKEN.expiresAt, lastUsedAt: AI_TOKEN.lastUsedAt } });
    createUserServer({ ...CONFIG, token: OSCT_TOKEN, tokenSource: "env" }, api, user);
    expect(current.tools.has("list_books")).toBe(true);
    // the mail sign-in stays for people without a token
    expect(current.tools.has("sign_in_request")).toBe(true);
    const who = await current.call("whoami");
    expect(who.ok).toBe(true);
    expect(who.data.signedIn).toMatchObject({ with: "token", token: { name: "Claude on my laptop", prefix: "osct_abcd…" } });
    expect(who.data.signedIn.limits).toContain("never publishes");
    expect(who.raw).not.toContain(OSCT_TOKEN);
    expect(fake.seen.at(-1)!.headers.Authorization).toBe(`Bearer ${OSCT_TOKEN}`);
  });

  it("a session says so in whoami", async () => {
    current = recorder();
    const fake = fakeFetch(accountsApi);
    const api = fake.api("tok-editor");
    createUserServer({ ...CONFIG, token: "tok-editor", tokenSource: "env" }, api, await fetchUser(api));
    expect((await current.call("whoami")).data.signedIn).toEqual({ with: "session" });
  });

  it("publish with a token: the API's 403 not-for-ai comes back with a hint to hand it to the person", async () => {
    current = recorder();
    const fake = fakeFetch(accountsApi);
    const api = fake.api(OSCT_TOKEN);
    createUserServer({ ...CONFIG, token: OSCT_TOKEN, tokenSource: "env" }, api, await fetchUser(api));
    const result = await current.call("publish", { book: "osct", env: "local" });
    expect(result.ok).toBe(false);
    expect(result.data.error).toMatchObject({ status: 403, code: "not-for-ai" });
    expect(result.data.error.hint).toContain("the person does it in the editor");
  });

  it("an expired token: whoami's error says to renew it on the books page", async () => {
    current = recorder();
    const fake = fakeFetch(accountsApi);
    createUserServer({ ...CONFIG, token: "osct_expired", tokenSource: "env" }, fake.api("osct_expired"), null);
    const who = await current.call("whoami");
    expect(who.ok).toBe(false);
    expect(who.data.error.code).toBe("token-expired");
    expect(who.data.error.hint).toContain("renews it on the editor's books page");
  });
});
