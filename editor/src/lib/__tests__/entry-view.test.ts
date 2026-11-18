import { describe, expect, it } from "vitest";
import { entryLink, entryRowHelp } from "../entry-view";

/** #227: the entry as the panels show it when the tree selects one (the entry's form: entry-edit.test.ts) */

describe("the entry's words", () => {
  it("a link opens only over http(s)", () => {
    expect(entryLink("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
    expect(entryLink(" http://example.org ")).toBe("http://example.org/");
    expect(entryLink("javascript:alert(1)")).toBeNull();
    expect(entryLink("not a url")).toBeNull();
    expect(entryLink(undefined)).toBeNull();
  });

  it("the entry row's help says what a tap does, with or without a target", () => {
    expect(entryRowHelp({ category: "text" }, true)).toBe("text – a tap selects the entry: the Inspector shows its form, the stage outlines its target");
    expect(entryRowHelp({ category: "glossary" }, false)).toContain("(it has no target)");
  });
});
