import { describe, expect, it } from "vitest";
import { firstTab, TABS, tabOf, WORD_TABS_MIN, wordTabs } from "../panel-tabs";

// The panel's tabs (#229): no Stage tab – the spread is the Inspector's, the preview settings the toolbar's
describe("the panel's tabs", () => {
  it("are the Inspector, Environment, Library and Code, and the tree (a phone's first tab)", () => {
    expect(TABS).toEqual(["tree", "inspector", "environment", "library", "code"]);
    expect(TABS).not.toContain("stage");
    expect(TABS).not.toContain("entity");
  });

  it("maps a tab stored before #229 to the Inspector: the Stage tab and the Entity tab", () => {
    expect(tabOf("stage")).toBe("inspector");
    expect(tabOf("entity")).toBe("inspector");
    expect(firstTab(null, "stage")).toBe("inspector");
    expect(firstTab(null, "entity")).toBe("inspector");
  });

  it("keeps today's tabs and drops anything else", () => {
    for (const tab of TABS) expect(tabOf(tab)).toBe(tab);
    expect(tabOf("settings")).toBeNull();
    expect(tabOf("constructor")).toBeNull();
    expect(tabOf("")).toBeNull();
    expect(tabOf(null)).toBeNull();
  });

  it("opens with the asked tab (?tab=), else the stored one, else the Inspector", () => {
    expect(firstTab("environment", "code")).toBe("environment");
    expect(firstTab("stage", "code")).toBe("inspector");
    expect(firstTab("nonsense", "code")).toBe("code");
    expect(firstTab(null, "library")).toBe("library");
    expect(firstTab(null, null)).toBe("inspector");
    expect(firstTab(undefined, "nonsense")).toBe("inspector");
  });
});

// The Inspector's head stays one line (#172): words in a wide panel, icons in a narrow one – wider with a finger
describe("the Inspector's tabs as words or icons", () => {
  it("shows words from the least width on, icons below it", () => {
    expect(wordTabs(WORD_TABS_MIN.fine, false)).toBe(true);
    expect(wordTabs(WORD_TABS_MIN.fine - 1, false)).toBe(false);
    expect(wordTabs(400, false)).toBe(true);
    expect(wordTabs(400, true)).toBe(false);
    expect(wordTabs(WORD_TABS_MIN.coarse, true)).toBe(true);
  });
});
