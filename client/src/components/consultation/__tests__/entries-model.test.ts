import { describe, expect, it } from "vitest";
import { categoryLabel, entriesOf, entryLabel, entryLabelHtml, groupEntries, isCategory, isListCategory, linkEmbed, MARGINALIA_MENU, sceneOrderOf, sortEntries } from "../entries-model";
import { ALL_CATEGORY, EntryCategory } from "@/types";

const entry = (title: string, category: EntryCategory = EntryCategory.Glossary, author?: string, sceneId = "s1") => ({ title, category, author, sceneId });

describe("entries model", () => {
  it("knows the four categories", () => {
    expect(["glossary", "video", "text", "link"].every(isCategory)).toBe(true);
    expect(isCategory("poems")).toBe(false);
    expect(isCategory("videos")).toBe(false);
    expect(isCategory("all")).toBe(false);
    expect(isListCategory("all")).toBe(true);
    expect(isListCategory("text")).toBe(true);
    expect(isListCategory("poems")).toBe(false);
  });

  it("has the Marginalia menu – Glossary, Texts, Links, All – without the Videos (#286)", () => {
    expect(MARGINALIA_MENU).toEqual(["glossary", "text", "link", "all"]);
  });

  it("lists every entry but the videos under All, one category otherwise", () => {
    const entries = [entry("G"), entry("V", EntryCategory.Video), entry("T", EntryCategory.Text), entry("L", EntryCategory.Link)];
    expect(entriesOf(entries, ALL_CATEGORY).map(e => e.title)).toEqual(["G", "T", "L"]);
    expect(entriesOf(entries, EntryCategory.Video).map(e => e.title)).toEqual(["V"]);
  });

  it("labels categories from the enum values in the plural, the glossary as Marginalia (#286)", () => {
    expect(categoryLabel(EntryCategory.Video)).toBe("Videos");
    expect(categoryLabel(EntryCategory.Glossary)).toBe("Marginalia");
    expect(categoryLabel(ALL_CATEGORY)).toBe("All");
  });

  it("labels works with title and author, without quotes, the title in italics (#287)", () => {
    expect(entryLabel(entry("Fake For Real", EntryCategory.Text, "Catherine Guiral"))).toBe("Fake For Real, Catherine Guiral");
    expect(entryLabel(entry("Fake For Real", EntryCategory.Text))).toBe("Fake For Real");
    expect(entryLabel(entry("Metafiction"))).toBe("Metafiction");
    expect(entryLabelHtml(entry("Morpher", EntryCategory.Video, "Rijksakademie <Amsterdam>"))).toBe("<i>Morpher</i>, Rijksakademie &lt;Amsterdam&gt;");
    expect(entryLabelHtml(entry("Metafiction"))).toBe("Metafiction");
  });

  it("sorts All by scene order, then by title (#319) – an entry of an unknown scene last", () => {
    const order = sceneOrderOf([{ id: "cover" }, { id: "s9" }, { id: "s2" }]);
    const groups = groupEntries([entry("B", EntryCategory.Text, undefined, "s2"), entry("Y", EntryCategory.Text, undefined, "gone"), entry("Z", EntryCategory.Glossary, undefined, "s9"), entry("A", EntryCategory.Link, undefined, "s2"), entry("V", EntryCategory.Video, undefined, "cover")], ALL_CATEGORY, order);
    expect(groups).toHaveLength(1);
    expect(groups[0].letter).toBeNull();
    expect(groups[0].entries.map(e => e.title)).toEqual(["Z", "A", "B", "Y"]);
  });

  it("sorts naturally and case-insensitively", () => {
    expect(sortEntries([entry("b"), entry("A10"), entry("a2")]).map(e => e.title)).toEqual(["a2", "A10", "b"]);
  });

  it("groups the glossary by first letter, entries without a letter first without header", () => {
    const groups = groupEntries(
      [entry("Blender"), entry("4th wall"), entry("Animals"), entry("Écriture"), entry("archimbolde"), entry("Clip", EntryCategory.Video)],
      EntryCategory.Glossary,
    );
    expect(groups.map(g => [g.letter, g.entries.map(e => e.title)])).toEqual([
      [null, ["4th wall"]],
      ["A", ["Animals", "archimbolde"]],
      ["B", ["Blender"]],
      ["E", ["Écriture"]],
    ]);
  });

  it("keeps other categories as one list, and returns nothing for an empty category", () => {
    expect(groupEntries([entry("B", EntryCategory.Text), entry("A", EntryCategory.Text)], EntryCategory.Text)).toEqual([
      { letter: null, entries: [entry("A", EntryCategory.Text), entry("B", EntryCategory.Text)] },
    ]);
    expect(groupEntries([entry("A")], EntryCategory.Link)).toEqual([]);
  });

  it("embeds YouTube / Vimeo as a player and other pages as a page", () => {
    const youtube = { id: "youtube", name: "YouTube", policy: "https://policies.google.com/privacy" };
    const player = "https://www.youtube-nocookie.com/embed/abc123";
    expect(linkEmbed("https://www.youtube.com/watch?v=abc123&t=4")).toEqual({ kind: "video", src: player, playSrc: `${player}?autoplay=1`, provider: youtube });
    expect(linkEmbed("https://youtu.be/abc123")).toEqual({ kind: "video", src: player, playSrc: `${player}?autoplay=1`, provider: youtube });
    expect(linkEmbed("https://vimeo.com/76979871")).toEqual({
      kind: "video",
      src: "https://player.vimeo.com/video/76979871?dnt=1",
      playSrc: "https://player.vimeo.com/video/76979871?dnt=1&autoplay=1",
      provider: { id: "vimeo", name: "Vimeo", policy: "https://vimeo.com/privacy" },
    });
    expect(linkEmbed("https://www.theguardian.com/media/article")).toEqual({
      kind: "page",
      src: "https://www.theguardian.com/media/article",
      provider: { id: "theguardian.com", name: "theguardian.com" },
    });
    expect(linkEmbed("javascript:alert(1)")).toBeUndefined();
    expect(linkEmbed("not a url")).toBeUndefined();
  });
});
