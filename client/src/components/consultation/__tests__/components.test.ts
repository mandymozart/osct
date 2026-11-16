import { beforeEach, describe, expect, it } from "vitest";
import { GameStoreService } from "@/services";
import { EntryCategory, Pages } from "@/types";
import { getEntries, getSpread } from "@/utils/game-config";
import { pageLabel } from "../entries-model";
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
  it("shows the value, opens the menu with the selected choice on top and navigates to the chosen one", () => {
    const filter = mount<EntriesFilterElement>("entries-filter");
    filter.value = EntryCategory.Text;
    const root = filter.shadowRoot!;
    const toggle = root.querySelector<HTMLElement>("[data-action=toggle]")!;
    expect(toggle.querySelector(".label")?.textContent).toBe("Texts");
    expect(toggle.querySelector(".burger")).not.toBeNull();

    toggle.click();
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-filter]"));
    expect(items.map(b => b.dataset.filter)).toEqual(["text", "glossary", "link", "all"]);
    expect(items.map(b => b.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
    expect(items[0].classList.contains("gold")).toBe(true);
    expect(items[1].classList.contains("white")).toBe(true);

    root.querySelector<HTMLElement>("[data-filter=all]")!.click();
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRIES, param: { value: "all" } });
    expect(root.querySelector(".menu")).toBeNull();
  });

  it("reads Marginalia, white and with nothing selected, while the Videos are shown (#286)", () => {
    const filter = mount<EntriesFilterElement>("entries-filter");
    filter.value = EntryCategory.Video;
    const root = filter.shadowRoot!;
    const toggle = root.querySelector<HTMLElement>("[data-action=toggle]")!;
    expect(toggle.querySelector(".label")?.textContent).toBe("Marginalia");
    expect(toggle.classList.contains("inactive")).toBe(true);
    toggle.click();
    expect(Array.from(root.querySelectorAll<HTMLElement>("[data-filter]"), b => b.dataset.filter)).toEqual(["glossary", "text", "link", "all"]);
    expect(root.querySelectorAll("[aria-checked=true]")).toHaveLength(0);
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
  const glossary = () => getEntries().filter(e => e.category === EntryCategory.Glossary);

  it("lists every entry with its page: consulted ones open, the others are greyed and do not (#287)", () => {
    const list = mount<EntriesList>("entries-list");
    const [first, second] = glossary();
    game.history.consultEntry(first.id);
    list.setEntries(EntryCategory.Glossary, glossary());
    const root = list.shadowRoot!;

    expect(root.querySelectorAll(".row")).toHaveLength(glossary().length);
    expect(root.querySelectorAll(".letter").length).toBeGreaterThan(0);
    expect(root.querySelector(".head")?.textContent).toContain("Name");
    expect(root.querySelectorAll("button.row")).toHaveLength(1);
    expect(root.querySelectorAll(".row.locked")).toHaveLength(glossary().length - 1);
    expect(root.querySelector(`button[data-entry="${first.id}"] .page`)?.textContent).toBe(pageLabel(first.page, getSpread(first.spreadId)));

    root.querySelector<HTMLElement>(".row.locked")!.click();
    expect(game.state.currentRoute?.page).not.toBe(Pages.ENTRY);
    root.querySelector<HTMLElement>("button.row")!.click();
    expect(game.state.currentRoute?.page).toBe(Pages.ENTRY);
    expect(second).toBeDefined();
  });

  it("heads the texts with Title", () => {
    const list = mount<EntriesList>("entries-list");
    list.setEntries(EntryCategory.Text, [{ ...getEntries()[0], category: EntryCategory.Text, author: "Catherine Guiral" }]);
    expect(list.shadowRoot!.querySelector(".head")?.textContent).toContain("Title");
    expect(list.shadowRoot!.querySelector(".row i")).not.toBeNull();
  });

  it("lists the videos white and not clickable, under the scan hint (#288)", () => {
    const list = mount<EntriesList>("entries-list");
    const videos = getEntries().filter(e => e.category === EntryCategory.Video);
    videos.forEach(v => game.history.consultEntry(v.id));
    list.setEntries(EntryCategory.Video, videos);
    const root = list.shadowRoot!;
    expect(root.textContent).toContain("Go to page in scan mode to play the video.");
    expect(root.querySelectorAll("button")).toHaveLength(0);
    expect(root.querySelectorAll(".row")).toHaveLength(videos.length);
    expect(root.querySelector("ul.gold")).toBeNull();
  });

  it("says when a category has no entries", () => {
    const list = mount<EntriesList>("entries-list");
    list.setEntries(EntryCategory.Link, []);
    expect(list.shadowRoot!.textContent).toContain("No entries here yet.");
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
