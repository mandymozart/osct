import { beforeEach, describe, expect, it } from "vitest";
import { sections } from "../sections.svelte";

const KEY = "osct-editor-sections";

beforeEach(() => {
  localStorage.clear();
  sections.reload();
});

describe("sections: the open state per collapsible section", () => {
  it("takes the section's default until it is toggled", () => {
    expect(sections.isOpen("stage.narrative", false)).toBe(false);
    expect(sections.isOpen("stage.stage", true)).toBe(true);
  });

  it("keeps each section's state apart and stores it", () => {
    sections.toggle("stage.narrative", false);
    sections.toggle("stage.passes", true);
    expect(sections.isOpen("stage.narrative", false)).toBe(true);
    expect(sections.isOpen("stage.passes", true)).toBe(false);
    expect(sections.isOpen("stage.stage", true)).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ "stage.narrative": true, "stage.passes": false });
  });

  it("reads the stored state back, ignoring what is not a boolean", () => {
    localStorage.setItem(KEY, JSON.stringify({ "stage.stage": false, broken: "yes" }));
    sections.reload();
    expect(sections.isOpen("stage.stage", true)).toBe(false);
    expect(sections.isOpen("broken", true)).toBe(true);
  });

  it("starts from the defaults when the stored value is no object", () => {
    localStorage.setItem(KEY, "[not json");
    sections.reload();
    expect(sections.isOpen("stage.stage", true)).toBe(true);
    localStorage.setItem(KEY, "[true]");
    sections.reload();
    expect(sections.isOpen("0", false)).toBe(false);
  });
});
