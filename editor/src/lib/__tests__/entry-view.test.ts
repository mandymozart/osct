import { describe, expect, it } from "vitest";
import { entryLink, entryRowHelp } from "../entry-view";
import { passesState, spreadPages } from "../spread-view";

/** #227: the entry and the spread as the panels show them when the tree selects one (the entry's form: entry-edit.test.ts) */

describe("the entry's words", () => {
  it("a link opens only over http(s)", () => {
    expect(entryLink("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
    expect(entryLink(" http://example.org ")).toBe("http://example.org/");
    expect(entryLink("javascript:alert(1)")).toBeNull();
    expect(entryLink("not a url")).toBeNull();
    expect(entryLink(undefined)).toBeNull();
  });

  it("the entry row's help says what a tap does, with or without a target", () => {
    expect(entryRowHelp({ category: "text", page: 3 }, true)).toBe("text · p. 3 – a tap selects the entry: the Inspector shows its form, the stage outlines its target");
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
    // A pass switched off (#233)
    expect(passesState([{ type: "bloom", enabled: false }, { type: "grade" }], undefined)).toBe("the whole book · bloom off, grade");
  });
});
