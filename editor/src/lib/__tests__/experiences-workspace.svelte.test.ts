import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperienceSummary } from "@shared/api/editor";

// The Experiences workspace (#356) at /editor/, its experiences from a mocked API
vi.mock("$app/state", () => ({
  page: { params: {}, url: new URL("http://localhost/editor/"), route: { id: "/(app)" } },
}));
vi.mock("$app/paths", () => ({ resolve: (path: string) => `/editor/${path.replace(/^\//, "")}`, asset: (path: string) => path }));
const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock("$app/navigation", () => ({ goto }));

const book = (id: string, title: string, live: ExperienceSummary["live"] = []): ExperienceSummary => ({
  id, title, experience: { id, title, book: { author: "A. Author" } }, initialScene: "s1", schema: "6.2", assetsBase: "", libraryBase: "", live,
} as unknown as ExperienceSummary);

const { api } = vi.hoisted(() => ({
  api: {
    experiences: [] as ExperienceSummary[],
    environments: [] as Array<{ env: string; error: string }>,
    tokens: [] as unknown[],
  },
}));
const { createApiToken, listApiTokens } = vi.hoisted(() => ({
  createApiToken: vi.fn(async (name: string) => {
    const apiToken = { id: 1, name, prefix: "osct_abc…", createdAt: "2026-11-23T10:00:00Z", lastUsedAt: null, expiresAt: "2027-05-24T10:00:00Z" };
    api.tokens = [apiToken];
    return { apiToken, token: "osct_abcdef123456" };
  }),
  listApiTokens: vi.fn(async () => ({ tokens: api.tokens })),
}));
vi.mock("../api", async original => ({
  ...(await original<typeof import("../api")>()),
  listExperiences: vi.fn(async () => ({ experiences: api.experiences, environments: api.environments })),
  listEnvironments: vi.fn(async () => ({ env: "local" })),
  recentChanges: vi.fn(async () => ({ changes: [] })),
  listVersions: vi.fn(async () => ({ versions: [] })),
  getExperience: vi.fn(async () => { throw new Error("no tree here"); }),
  listScenes: vi.fn(async () => { throw new Error("no scenes here"); }),
  getHealth: vi.fn(async () => ({ env: "local" })),
  listApiTokens,
  createApiToken,
}));

const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await tick();
  }
  flushSync();
};

/** The Inspector tab's region: its accessible name says what it shows */
const inspector = () => document.querySelector<HTMLElement>("section.context");
const tab = (id: string) => document.querySelector<HTMLButtonElement>(`[role=tab][data-tab="${id}"]`);
const card = (id: string) => document.querySelector<HTMLButtonElement>(`[data-card="${id}"]`)!;
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

// A whole page mounted per test: its first load can take more than the default 5 s under load (CI, the full suite) – each
// test waits for the page to be ready (`render`), so a slow machine waits longer instead of failing
vi.setConfig({ testTimeout: 30000 });

describe("the Experiences workspace (#356)", () => {
  let component: ReturnType<typeof mount> | undefined;
  beforeEach(() => {
    localStorage.clear();
    api.experiences = [book("osct", "Onion Skin", [{ env: "staging", build: "b1" }] as ExperienceSummary["live"]), book("demo", "Demo")];
    api.environments = [];
    api.tokens = [{ id: 7, name: "Old", prefix: "osct_old…", createdAt: "2026-11-01T10:00:00Z", lastUsedAt: null, expiresAt: "2027-05-01T10:00:00Z" }];
    createApiToken.mockClear();
    goto.mockClear();
  });
  afterEach(() => {
    if (component) unmount(component);
    component = undefined;
    document.body.innerHTML = "";
  });

  /** The page mounted and ready – its covers and the Inspector there; a fixed number of turns was not enough under load */
  const render = async () => {
    const { default: Page } = await import("../../routes/(app)/+page.svelte");
    component = mount(Page, { target: document.body });
    await vi.waitFor(() => {
      if (api.experiences.length && !document.querySelector("[data-card]")) throw new Error("the books are not on the stage yet");
      if (!inspector()) throw new Error("the Inspector is not there yet");
    }, { timeout: 15000, interval: 25 });
    await settle();
  };

  it("puts the books on the stage and the Inspector, AI connections and Info in floating panels – no History", async () => {
    await render();
    const stage = document.querySelector(".workspace .stage")!;
    expect([...stage.querySelectorAll("[data-card]")].map(c => c.getAttribute("data-card"))).toEqual(["osct", "demo", "new"]);
    expect(stage.querySelector("canvas")).toBeNull();
    expect(tab("inspector")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("ai")?.getAttribute("aria-selected")).toBe("false");
    expect(tab("ai")?.closest("[data-tab-head]")).toBe(tab("inspector")?.closest("[data-tab-head]"));
    // Info folded at the start, as in the other workspaces
    expect(document.querySelector('[aria-label^="Move the Info panel"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(tab("history")).toBeNull();
    // AI connections is not under the books any more
    expect(stage.querySelector("section.ai")).toBeNull();
    // The top bar's panels menu lists this workspace's panels
    const { openFloats } = await import("../components/floats.svelte.js");
    expect(openFloats.current?.workspace).toBe("experiences");
    expect(openFloats.current?.closable().map(p => p.id)).toEqual(["ai", "info"]);
  });

  it("shows in the Inspector quick access, a book's sheet or the New flow by state", async () => {
    await render();
    expect(inspector()?.getAttribute("aria-label")).toBe("Quick access");
    expect(inspector()?.textContent).toContain("Last worked on");

    // Manage → the sheet; Manage again → quick access
    document.querySelector<HTMLButtonElement>('[aria-label="Manage Onion Skin"]')!.click();
    await settle();
    expect(inspector()?.getAttribute("aria-label")).toBe("Onion Skin");
    expect(document.querySelector('[aria-label="Manage Onion Skin"]')?.getAttribute("aria-pressed")).toBe("true");
    document.querySelector<HTMLButtonElement>('[aria-label="Manage Onion Skin"]')!.click();
    await settle();
    expect(inspector()?.getAttribute("aria-label")).toBe("Quick access");

    // The + card → the New flow
    card("new").click();
    await settle();
    expect(inspector()?.getAttribute("aria-label")).toBe("New experience");
    expect(inspector()?.querySelector("h2")?.textContent).toBe("New experience");

    // The ☰ menu's Import… → the New flow from an export
    const { experiencesMenu } = await import("../experiences-menu.svelte.js");
    document.querySelector<HTMLButtonElement>('[aria-label="Manage Demo"]')!.click();
    await settle();
    expect(inspector()?.getAttribute("aria-label")).toBe("Demo");
    experiencesMenu.ask("import");
    await settle();
    expect(inspector()?.getAttribute("aria-label")).toBe("New experience");
  });

  it("keeps the keys: Space manages the focused book, the sheet follows the focus, Esc closes it, Enter opens", async () => {
    await render();
    expect(document.querySelector('[aria-label="Manage Onion Skin"]')?.getAttribute("tabindex")).toBe("-1");
    card("osct").focus();
    key(card("osct"), " ");
    await settle();
    expect(inspector()?.getAttribute("aria-label")).toBe("Onion Skin");
    key(card("osct"), "ArrowRight");
    await settle();
    expect(document.activeElement).toBe(card("demo"));
    expect(inspector()?.getAttribute("aria-label")).toBe("Demo");
    key(card("demo"), "Escape");
    await settle();
    expect(inspector()?.getAttribute("aria-label")).toBe("Quick access");
    key(card("demo"), "Enter");
    expect(goto).toHaveBeenCalledWith("/editor/demo/");
  });

  it("has AI connections as a tab – a token made there survives a switch of tabs, and Manage brings the Inspector's tab back", async () => {
    api.tokens = [];
    await render();
    expect(createApiToken).not.toHaveBeenCalled();
    tab("ai")!.click();
    await settle();
    expect(document.querySelector('section.ai[aria-label="AI connections"]')).not.toBeNull();
    expect(createApiToken).toHaveBeenCalledTimes(1);
    expect(document.querySelector("section.ai")?.textContent).toContain("osct_abcdef123456");

    tab("inspector")!.click();
    await settle();
    expect(document.querySelector("section.ai")).toBeNull();
    tab("ai")!.click();
    await settle();
    expect(createApiToken).toHaveBeenCalledTimes(1);
    expect(document.querySelector("section.ai")?.textContent).toContain("osct_abcdef123456");

    document.querySelector<HTMLButtonElement>('[aria-label="Manage Demo"]')!.click();
    await settle();
    expect(tab("inspector")?.getAttribute("aria-selected")).toBe("true");
    expect(inspector()?.getAttribute("aria-label")).toBe("Demo");
  });

  it("says when there is no experience yet, and which environment's store cannot be read", async () => {
    api.experiences = [];
    api.environments = [{ env: "production", error: "403" }];
    await render();
    const stage = document.querySelector(".workspace .stage")!;
    expect([...stage.querySelectorAll("[data-card]")].map(c => c.getAttribute("data-card"))).toEqual(["new"]);
    expect(stage.textContent).toContain("No experience yet.");
    expect(stage.textContent).toContain("production: the content store cannot be read");
  });
});
