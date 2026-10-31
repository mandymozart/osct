import { beforeEach, describe, expect, it } from "vitest";
import { GameStoreService } from "@/services";
import { EntryCategory, Pages } from "@/types";
import { getEntries } from "@/utils/game-config";
import ".."; // registers the elements (the named import below is type-only)
import type { EntriesFilterElement, EntriesList, EntryDetail } from "..";

const game = GameStoreService.getInstance();
const mount = <T extends HTMLElement>(tag: string): T => document.body.appendChild(document.createElement(tag)) as T;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  game.history.reset();
});

describe("entries filter", () => {
  it("shows the value, opens the menu and navigates to the chosen filter", () => {
    const filter = mount<EntriesFilterElement>("entries-filter");
    filter.value = EntryCategory.Video;
    const root = filter.shadowRoot!;
    expect(root.querySelector("[data-action=toggle]")?.textContent).toBe("Videos");

    root.querySelector<HTMLElement>("[data-action=toggle]")!.click();
    expect(Array.from(root.querySelectorAll<HTMLElement>("[data-filter]"), b => b.dataset.filter))
      .toEqual(["glossary", "video", "text", "link"]);

    root.querySelector<HTMLElement>("[data-filter=text]")!.click();
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRIES, param: { value: "text" } });
    expect(root.querySelector(".menu")).toBeNull();
  });

  it("closes on an outside tap and on Escape", async () => {
    const filter = mount<EntriesFilterElement>("entries-filter");
    const toggle = () => filter.shadowRoot!.querySelector<HTMLElement>("[data-action=toggle]")!.click();
    const isOpen = () => !!filter.shadowRoot!.querySelector(".menu");

    toggle();
    await tick();
    document.body.click();
    expect(isOpen()).toBe(false);

    toggle();
    await tick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(isOpen()).toBe(false);
  });
});

describe("entries list", () => {
  it("groups glossary entries by letter and opens an entry on tap", () => {
    const list = mount<EntriesList>("entries-list");
    const glossary = getEntries().filter(e => e.category === EntryCategory.Glossary);
    list.setEntries(EntryCategory.Glossary, glossary);
    const root = list.shadowRoot!;

    expect(root.querySelectorAll(".row")).toHaveLength(glossary.length);
    expect(root.querySelectorAll(".letter").length).toBeGreaterThan(0);

    root.querySelector<HTMLElement>(".row")!.click();
    expect(game.state.currentRoute?.page).toBe(Pages.ENTRY);
  });

  it("says when a category has no consulted entries", () => {
    const list = mount<EntriesList>("entries-list");
    list.setEntries(EntryCategory.Link, []);
    expect(list.shadowRoot!.textContent).toContain("No entries consulted yet.");
  });
});

describe("entry detail", () => {
  const glossaryEntry = () => getEntries().find(e => e.category === EntryCategory.Glossary)!;

  it("renders the body's Markdown and fills in the book's variables (content schema 2.23)", () => {
    const detail = mount<EntryDetail>("entry-detail");
    detail.variables = name => ({ visitor: "Kévin", hasKey: true } as Record<string, unknown>)[name];
    detail.entry = { ...glossaryEntry(), body: "Hello **{visitor}**, *welcome*.\n\n{hasKey: The door opens.|Locked.} See [the site](https://example.org)." };
    const body = detail.shadowRoot!.querySelector(".body")!;

    expect(body.querySelectorAll("p")).toHaveLength(2);
    expect(body.querySelector("strong")?.textContent).toBe("Kévin");
    expect(body.querySelector("em")?.textContent).toBe("welcome");
    expect(body.textContent).toContain("The door opens.");
    const link = body.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.org");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows no HTML of the body and no unset variable", () => {
    const detail = mount<EntryDetail>("entry-detail");
    detail.entry = { ...glossaryEntry(), body: '<img src=x onerror="alert(1)"> [x](javascript:alert(1)) {name}!' };
    const body = detail.shadowRoot!.querySelector(".body")!;

    expect(body.querySelector("img:not(.entry-image)")).toBeNull();
    expect(body.querySelector("a")).toBeNull();
    expect(body.querySelector("p")?.textContent).toBe('<img src=x onerror="alert(1)"> [x](javascript:alert(1)) !');
  });
});
