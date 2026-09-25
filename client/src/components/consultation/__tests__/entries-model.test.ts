import { describe, expect, it } from "vitest";
import { entryLabel, groupEntries, isCategory, linkEmbed, paragraphs, sortEntries } from "../entries-model";
import { EntryCategory } from "@/types";

const entry = (title: string, category: EntryCategory = "glossary", author?: string) => ({ title, category, author });

describe("entries model", () => {
  it("knows the four categories", () => {
    expect(["glossary", "videos", "texts", "links"].every(isCategory)).toBe(true);
    expect(isCategory("bookmarked")).toBe(false);
  });

  it("labels texts with their author, other entries with the title", () => {
    expect(entryLabel(entry("Fake For Real", "texts", "Catherine Guiral"))).toBe("'Fake For Real', Catherine Guiral");
    expect(entryLabel(entry("Fake For Real", "texts"))).toBe("Fake For Real");
    expect(entryLabel(entry("Metafiction"))).toBe("Metafiction");
  });

  it("sorts naturally and case-insensitively", () => {
    expect(sortEntries([entry("b"), entry("A10"), entry("a2")]).map(e => e.title)).toEqual(["a2", "A10", "b"]);
  });

  it("groups the glossary by first letter, entries without a letter first without header (frame 17)", () => {
    const groups = groupEntries(
      [entry("Blender"), entry("4th wall"), entry("Animals"), entry("Écriture"), entry("archimbolde"), entry("Clip", "videos")],
      "glossary",
    );
    expect(groups.map(g => [g.letter, g.entries.map(e => e.title)])).toEqual([
      [null, ["4th wall"]],
      ["A", ["Animals", "archimbolde"]],
      ["B", ["Blender"]],
      ["E", ["Écriture"]],
    ]);
  });

  it("keeps other categories as one list, and returns nothing for an empty category", () => {
    expect(groupEntries([entry("B", "texts"), entry("A", "texts")], "texts")).toEqual([
      { letter: null, entries: [entry("A", "texts"), entry("B", "texts")] },
    ]);
    expect(groupEntries([entry("A")], "links")).toEqual([]);
  });

  it("splits a body into paragraphs at blank lines", () => {
    expect(paragraphs("One\nstill one\n\n  Two  \n\n\n")).toEqual(["One\nstill one", "Two"]);
  });

  it("embeds YouTube / Vimeo as a player and other pages as a page", () => {
    expect(linkEmbed("https://www.youtube.com/watch?v=abc123&t=4")).toEqual({ kind: "video", src: "https://www.youtube-nocookie.com/embed/abc123" });
    expect(linkEmbed("https://youtu.be/abc123")).toEqual({ kind: "video", src: "https://www.youtube-nocookie.com/embed/abc123" });
    expect(linkEmbed("https://vimeo.com/76979871")).toEqual({ kind: "video", src: "https://player.vimeo.com/video/76979871?dnt=1" });
    expect(linkEmbed("https://www.theguardian.com/media/article")).toEqual({ kind: "page", src: "https://www.theguardian.com/media/article" });
    expect(linkEmbed("javascript:alert(1)")).toBeUndefined();
    expect(linkEmbed("not a url")).toBeUndefined();
  });
});
