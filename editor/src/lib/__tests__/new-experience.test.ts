import { describe, expect, it } from "vitest";
import { readerAddress, slugCheck, slugFromTitle } from "../new-experience";

// A new experience's slug (#343): its id, its reader path and its store's folder
describe("a new experience's slug", () => {
  it("is proposed from the title", () => {
    expect(slugFromTitle("Onion Skin & Crocodile Tears")).toBe("onion-skin-and-crocodile-tears");
    expect(slugFromTitle("  Kévin's Book: Part 2 ")).toBe("kevin-s-book-part-2");
    expect(slugFromTitle("!!!")).toBe("");
    expect(slugFromTitle("a".repeat(80))).toHaveLength(64);
  });

  it("is lower-case letters, digits and dashes, none of the site's own paths, and new", () => {
    expect(slugCheck("demo-2", ["osct", "demo"])).toBeNull();
    expect(slugCheck("", [])).toMatch(/slug/);
    expect(slugCheck("Demo", [])).toMatch(/lower-case/);
    expect(slugCheck("my_book", [])).toMatch(/lower-case/);
    expect(slugCheck("-demo", [])).toMatch(/lower-case/);
    expect(slugCheck("editor", [])).toMatch(/site's own paths/);
    expect(slugCheck("scene", [])).toMatch(/site's own paths/);
    expect(slugCheck("x", [])).toMatch(/site's own paths/);
    expect(slugCheck("demo", ["osct", "demo"])).toMatch(/already/);
    expect(slugCheck("my_book", ["My_Book"])).toMatch(/lower-case/);
  });

  it("gives the reader's address", () => {
    expect(readerAddress("https://osct.porschuetz.de", "demo")).toBe("https://osct.porschuetz.de/demo/");
    expect(readerAddress("https://osct.porschuetz.de/", "osct", "/scene/s1")).toBe("https://osct.porschuetz.de/osct/scene/s1");
  });
});
