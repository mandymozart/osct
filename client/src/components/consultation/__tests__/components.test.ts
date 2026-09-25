import { beforeEach, describe, expect, it } from "vitest";
import { GameStoreService } from "@/services";
import { EntryCategory, Pages } from "@/types";
import { getEntries } from "@/utils/game-config";
import { BOOKMARKED, EntriesFilterElement, EntriesList, EntryActions, isEntriesFilter } from "..";

const game = GameStoreService.getInstance();
const mount = <T extends HTMLElement>(tag: string): T => document.body.appendChild(document.createElement(tag)) as T;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  game.history.reset();
});

describe("entries filter", () => {
  it("knows the categories and Bookmarked", () => {
    expect(isEntriesFilter(EntryCategory.Video)).toBe(true);
    expect(isEntriesFilter(BOOKMARKED)).toBe(true);
    expect(isEntriesFilter("videos")).toBe(false);
  });

  it("shows the value, opens the menu and navigates to the chosen filter", () => {
    const filter = mount<EntriesFilterElement>("entries-filter");
    filter.value = EntryCategory.Video;
    const root = filter.shadowRoot!;
    expect(root.querySelector("[data-action=toggle]")?.textContent).toBe("Videos");

    root.querySelector<HTMLElement>("[data-action=toggle]")!.click();
    expect(Array.from(root.querySelectorAll<HTMLElement>("[data-filter]"), b => b.dataset.filter))
      .toEqual(["glossary", "video", "text", "link", "bookmarked"]);

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

  it("says when a filter is empty", () => {
    const list = mount<EntriesList>("entries-list");
    list.setEntries(BOOKMARKED, []);
    expect(list.shadowRoot!.textContent).toContain("No bookmarked entries yet.");
  });
});

describe("entry actions", () => {
  it("toggles the bookmark and saves the note when the entry changes", () => {
    const [first, second] = getEntries();
    const actions = mount<EntryActions>("entry-actions");
    actions.entryId = first.id;
    const root = actions.shadowRoot!;

    root.querySelector<HTMLElement>("[data-action=bookmark]")!.click();
    expect(game.history.isMarked(first.id)).toBe(true);
    expect(root.querySelector("[data-action=bookmark]")?.getAttribute("aria-pressed")).toBe("true");

    root.querySelector<HTMLElement>("[data-action=add-note]")!.click();
    expect(root.querySelector<HTMLElement>(".note")!.hidden).toBe(false);
    root.querySelector<HTMLTextAreaElement>("#note")!.value = "See p. 21";
    actions.entryId = second.id;
    expect(game.history.getNote(first.id)).toBe("See p. 21");
    expect(root.querySelector<HTMLElement>(".note")!.hidden).toBe(true);
  });
});
