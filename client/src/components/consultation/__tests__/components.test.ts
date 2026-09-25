import { beforeEach, describe, expect, it } from "vitest";
import { GameStoreService } from "@/services";
import { EntryCategory, Pages } from "@/types";
import { getEntries } from "@/utils/game-config";
import ".."; // registers the elements (the named import below is type-only)
import { EntriesFilterElement, EntriesList } from "..";

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
