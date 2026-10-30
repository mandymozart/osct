import { describe, expect, it } from "vitest";
import { entryLink, entryParagraphs, entryRowHelp, entryRows } from "../entry-view";
import { passesState, spreadPages } from "../spread-view";

/** #227: the entry and the spread as the panels show them when the tree selects one */

describe("the entry view", () => {
  it("the body in the reader's paragraphs: split at blank lines, trimmed, empty ones left out", () => {
    expect(entryParagraphs("One.\nstill one.\n\n  Two.  \n \n\n\nThree.")).toEqual(["One.\nstill one.", "Two.", "Three."]);
    expect(entryParagraphs("")).toEqual([]);
    expect(entryParagraphs("\n\n  \n")).toEqual([]);
  });

  it("the meta rows: category, title, access page – the author and the tags only when there are some", () => {
    const glossary = { category: "glossary", title: "About the demo", page: 2, body: "", tags: [] };
    expect(entryRows(glossary)).toEqual([
      { label: "category", value: "glossary" },
      { label: "title", value: "About the demo" },
      { label: "access page", value: "p. 2" },
    ]);
    const text = { ...glossary, category: "text", author: " Kévin Bray ", tags: ["key", "door"] };
    expect(entryRows(text).slice(3)).toEqual([{ label: "author", value: "Kévin Bray" }, { label: "tags", value: "key, door" }]);
    expect(entryRows({ ...glossary, author: "  " }).map(r => r.label)).not.toContain("author");
  });

  it("a link opens only over http(s)", () => {
    expect(entryLink("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
    expect(entryLink(" http://example.org ")).toBe("http://example.org/");
    expect(entryLink("javascript:alert(1)")).toBeNull();
    expect(entryLink("not a url")).toBeNull();
    expect(entryLink(undefined)).toBeNull();
  });

  it("the entry row's help says what a tap does, with or without a target", () => {
    expect(entryRowHelp({ category: "text", page: 3 }, true)).toBe("text · p. 3 – a tap selects the entry: the Entity panel shows its text, the stage outlines its target");
    expect(entryRowHelp({ category: "glossary", page: 2 }, false)).toContain("(it has no target)");
  });
});

describe("the spread view", () => {
  it("the pages in words", () => {
    expect(spreadPages({ firstPage: 28, lastPage: 29 })).toBe("28–29");
    expect(spreadPages({ firstPage: 3, lastPage: 3, format: "spread" })).toBe("3");
    expect(spreadPages({ firstPage: 1, lastPage: 1, format: "cover" })).toBe("cover");
    expect(spreadPages({ firstPage: 40, lastPage: 40, format: "back" })).toBe("back");
  });

  it("the post-processing in effect: the level and its passes", () => {
    expect(passesState([{ type: "bloom" }, { type: "grade" }], undefined)).toBe("the whole book · bloom, grade");
    expect(passesState(null, null)).toBe("the whole book · none");
    expect(passesState([{ type: "bloom" }], [{ type: "vignette" }])).toBe("only this spread · vignette");
    expect(passesState([{ type: "bloom" }], [])).toBe("only this spread · off");
  });
});
