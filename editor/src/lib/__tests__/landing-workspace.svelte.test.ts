import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CDN, draftConfiguration } from "./landing-workspace-fixture";

// The landing workspace (#356) at /editor/demo/landing/, its draft from a mocked API
vi.mock("$app/state", () => ({
  page: { params: { experience: "demo" }, url: new URL("http://localhost/editor/demo/landing/"), route: { id: "/(app)/[experience]/landing" } },
}));
vi.mock("$app/paths", () => ({ resolve: (path: string) => `/editor/${path.replace(/^\//, "")}`, asset: (path: string) => path }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
// The hero (three.js, the engine's loaders) is the reader's: here only what it is started with
const { startHero, putExperience } = vi.hoisted(() => ({ startHero: vi.fn(async (..._args: unknown[]) => ({ stop() {} })), putExperience: vi.fn(async () => ({})) }));
vi.mock("@ui/landing/hero", () => ({ startHero }));
vi.mock("../api", async original => ({
  ...(await original<typeof import("../api")>()),
  getExperience: vi.fn(async () => ({
    experience: { id: "demo", title: "Demo Book", assetsBase: CDN, experience: draftConfiguration().experience },
    scenes: draftConfiguration().scenes.map((scene, position) => ({ ...scene, position, entries: [], targets: [] })),
    groups: [],
  })),
  getDraftManifest: vi.fn(async () => ({ build: "b1", version: "6.11.0", schema: "6.2" })),
  getDraftFile: vi.fn(async (_id: string, _build: string, file: string) => (file === "files.json" ? {} : draftConfiguration())),
  getChanges: vi.fn(async () => ({ changes: [] })),
  listScenes: vi.fn(async () => ({ scenes: [], groups: [] })),
  listPlugins: vi.fn(async () => ({ plugins: [] })),
  putExperience,
  listAssets: vi.fn(async () => ({ assets: [{ id: "a1", name: "print.jpg", kind: "image", mime: "image/jpeg", size: 100, width: 800, height: 600, durationMs: null,
    version: 1, url: `${CDN}/uploads/print.jpg`, usages: 0, imported: false }] })),
}));
import { autosave } from "../autosave.svelte";

const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await tick();
  }
  flushSync();
};

describe("the landing workspace (#356)", () => {
  let component: ReturnType<typeof mount> | undefined;
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    if (component) unmount(component);
    component = undefined;
    document.body.innerHTML = "";
  });

  const render = async () => {
    const { default: Page } = await import("../../routes/(app)/[experience]/landing/+page.svelte");
    component = mount(Page, { target: document.body });
    await settle();
  };

  it("shows the landing page on the stage with the draft – the book's title, the QR card, the shop, the footer – with the brand's tokens on its own host", async () => {
    await render();
    const host = document.querySelector<HTMLElement>("[data-landing-stage]")!;
    expect(host).not.toBeNull();
    expect(host.hasAttribute("data-contained")).toBe(true);
    const root = host.shadowRoot!;
    expect(root.querySelector("h1")?.textContent).toContain("Demo Book");
    expect(root.querySelector(".address")?.textContent).toBe(location.host);
    expect([...root.querySelectorAll("[data-item]")].map(item => item.getAttribute("data-item"))).toEqual(["book", "shirt"]);
    expect(root.querySelector("footer")?.textContent).toContain("P. Press");
    expect(root.querySelector("footer a")?.getAttribute("href")).toBe("/demo/privacy");
    // The hero runs with the draft's pick – here the default, the first model
    expect(startHero).toHaveBeenCalled();
    expect(startHero.mock.calls.at(-1)?.[1]).toMatchObject({ entity: { type: "model", assets: [{ src: `${CDN}/assets/content/models/dragon.glb` }] } });
    // The brand stays inside: its tokens on the shadow host, the editor's document gets the font's faces only
    expect(root.querySelector("style")?.textContent?.startsWith(":host")).toBe(true);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--gold-gradient")).toBe("");
  });

  it("puts the brand's tokens on the piece's host, never on the editor's document (RULES #38)", async () => {
    const { brandHostStyles } = await import("../LandingStage.svelte");
    const tokens = readFileSync(resolve(import.meta.dirname, "../../../../ui/brand/tokens.css"), "utf8");
    const styles = brandHostStyles(tokens);
    expect(styles).toMatch(/:host \{[^}]*--gold-gradient/);
    expect(styles).not.toContain(":root");
  });

  it("offers in the Inspector only the scenes and targets with AR content", async () => {
    await render();
    const scene = document.querySelector<HTMLSelectElement>('select[aria-label="The hero\'s scene"]')!;
    expect(scene).not.toBeNull();
    expect([...scene.options].map(option => option.value)).toEqual(["", "s1"]);
    scene.value = "s1";
    scene.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    const target = document.querySelector<HTMLSelectElement>('select[aria-label="The hero\'s target"]')!;
    expect([...target.options].map(option => option.value)).toEqual(["dragon", "film"]);
    expect(target.value).toBe("dragon");
  });

  it("switches the texts' language – the stage follows; a typed text shows at once, is marked on the stage and saves the landing (#365)", async () => {
    putExperience.mockClear();
    await render();
    const root = document.querySelector<HTMLElement>("[data-landing-stage]")!.shadowRoot!;
    expect(root.querySelector(".scroll-hint")?.textContent).toContain("Get the app");
    [...document.querySelectorAll<HTMLButtonElement>(`[aria-label="The texts' language"] button`)].find(b => b.textContent?.trim() === "DE")!.click();
    await settle();
    expect(root.querySelector(".scroll-hint")?.textContent).toContain("Hol dir die App");
    const intro = document.querySelector<HTMLTextAreaElement>('textarea[data-landing-text="intro"]')!;
    // Empty: the app's text of that language, greyed
    expect(intro.placeholder).toContain("Die Begleit-App zu Demo Book von A. Author");
    const stage = root.querySelector(".stage");
    intro.focus();
    intro.dispatchEvent(new FocusEvent("focus"));
    intro.value = "Unser Buch {title}";
    intro.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(root.querySelector(".intro")?.textContent).toBe("Unser Buch Demo Book");
    expect(root.querySelector(".intro")?.hasAttribute("data-editing")).toBe(true);
    // The hero kept running: the page was updated, not mounted again
    expect(root.querySelector(".stage")).toBe(stage);
    await autosave.flush();
    expect(putExperience).toHaveBeenLastCalledWith("demo", { landing: { texts: { de: { intro: "Unser Buch {title}" } } } });
  });

  it("shop: Edit copies the app's items, + item adds one (held until it has a label and a link), ✕ removes, a picture comes from the Library (#365)", async () => {
    putExperience.mockClear();
    await render();
    const root = document.querySelector<HTMLElement>("[data-landing-stage]")!.shadowRoot!;
    const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text)!;
    button("Edit").click();
    await settle();
    expect(document.querySelectorAll("[data-shop-item]").length).toBe(2);
    expect([...root.querySelectorAll(".shop .name")].map(name => name.textContent)).toEqual(["The book", "The T-shirt"]);
    button("+ item").click();
    await settle();
    expect(document.querySelectorAll("[data-shop-item]").length).toBe(3);
    expect(autosave.status).toMatchObject({ state: "held" });
    const label = document.querySelector<HTMLInputElement>('input[aria-label="The label of shop item 3"]')!;
    label.value = "A print";
    label.dispatchEvent(new Event("input", { bubbles: true }));
    const link = document.querySelector<HTMLInputElement>('input[aria-label="The link of shop item 3"]')!;
    link.value = "https://shop.example/print";
    link.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect([...root.querySelectorAll(".shop .name")].map(name => name.textContent)).toEqual(["The book", "The T-shirt", "A print"]);
    // Its picture from the Library: the Library opens in the Inspector as the picker
    document.querySelector<HTMLButtonElement>('button[aria-label="The picture of A print"]')!.click();
    await settle();
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b => b.textContent?.includes("Library"))!.click();
    await settle();
    document.querySelector<HTMLButtonElement>(".group-head[aria-expanded='false']")?.click();
    await settle();
    const tile = document.querySelector<HTMLElement>(`[role="option"]`)!;
    expect(tile).not.toBeNull();
    tile.click();
    await settle();
    expect(document.querySelectorAll("[data-shop-item]").length).toBe(3);
    expect(root.querySelector<HTMLImageElement>('[data-item="2"] img')?.getAttribute("src")).toBe(`${CDN}/uploads/print.jpg`);
    document.querySelector<HTMLButtonElement>('button[aria-label="Remove shop item 1"]')!.click();
    await settle();
    await autosave.flush();
    expect(putExperience).toHaveBeenLastCalledWith("demo", { landing: { shop: [
      { label: "The T-shirt", url: "https://buildingfictions.com", image: "/assets/ui/landing/t-shirt.svg" },
      { label: "A print", url: "https://shop.example/print", image: `${CDN}/uploads/print.jpg` },
    ] } });
    // Emptied: no shop section on the page
    document.querySelector<HTMLButtonElement>('button[aria-label="Remove shop item 1"]')!.click();
    await settle();
    document.querySelector<HTMLButtonElement>('button[aria-label="Remove shop item 1"]')!.click();
    await settle();
    expect(root.querySelector(".shop-section")).toBeNull();
    await autosave.flush();
    expect(putExperience).toHaveBeenLastCalledWith("demo", { landing: { shop: [] } });
  });
});
