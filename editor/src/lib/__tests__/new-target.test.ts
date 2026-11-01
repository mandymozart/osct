import { describe, expect, it } from "vitest";
import { APPEARS, CATEGORIES, categoryFor } from "../new-target";

// #165: what appears on the page and the entry's category are two choices; the category follows the content
describe("a new target", () => {
  it("offers a 3D model among what appears on the page", () => {
    expect(APPEARS).toContain("model");
    expect(APPEARS[0]).toBe("");
  });

  it("starts its entry category from what appears: a video makes a Videos entry, anything else a glossary term", () => {
    expect(categoryFor("video")).toBe("video");
    expect(categoryFor("model")).toBe("glossary");
    expect(categoryFor("text")).toBe("glossary");
    expect(categoryFor("")).toBe("glossary");
    expect(CATEGORIES).toEqual(["glossary", "video", "text", "link"]);
  });
});
