import { describe, expect, it } from "vitest";
import { APPEARANCES, type AppearanceSpec, type BookAppearance } from "@engine/types";
import {
  appearanceHeading, appearanceToSave, draftAppearance, inheritLabel, lookSource, momentSummary, playedType, sameAppearance, setLook, setLookValue,
} from "../appearance-edit";
import { lookRows, passValue } from "../values";

/** The appearance panel (#265): a look per moment, a moment without one plays found's, then the default */

const builtInSpec = (type: string): AppearanceSpec | undefined => (APPEARANCES as Record<string, AppearanceSpec>)[type];
const rowsOf = (book: BookAppearance, moment: "reveal" | "found" | "lost") => (book[moment] ? lookRows(book[moment]!, moment, builtInSpec) : []);

describe("the book's looks by moment", () => {
  it("a moment plays its own look, else found's, else the default", () => {
    const book: BookAppearance = { found: { type: "printLift" } };
    expect(lookSource(book, "found")).toBe("own");
    expect(lookSource(book, "reveal")).toBe("found");
    expect(playedType(book, "reveal")).toBe("printLift");
    expect(lookSource({}, "lost")).toBe("default");
    expect(playedType({}, "lost")).toBe("inflateDissolve");
    // found never inherits: without a look of its own it plays the default
    expect(lookSource({ reveal: { type: "fade" } }, "found")).toBe("default");
  });

  it("the copy keeps the moments' order and never shares a look with the content", () => {
    const content: BookAppearance = { lost: { type: "fade" }, reveal: { type: "printLift", duration: 900 } };
    const draft = draftAppearance(content);
    expect(Object.keys(draft)).toEqual(["reveal", "lost"]);
    expect(draft.reveal).not.toBe(content.reveal);
    expect(sameAppearance(content, draft)).toBe(true);
    expect(draftAppearance(null)).toEqual({});
  });

  it("a save writes the moments with a look, null when none has one", () => {
    expect(appearanceToSave({ found: { type: "fade" } })).toEqual({ found: { type: "fade" } });
    expect(appearanceToSave({})).toBeNull();
    expect(sameAppearance(appearanceToSave({}), null)).toBe(true);
  });
});

describe("picking a look and changing its values", () => {
  it("another type starts at its defaults, the same type keeps its values, none removes the moment", () => {
    const book: BookAppearance = { found: { type: "printLift", duration: 900 } };
    expect(setLook(book, "found", "printLift")).toEqual(book);
    expect(setLook(book, "found", "fade")).toEqual({ found: { type: "fade" } });
    expect(setLook(book, "reveal", "fade")).toEqual({ reveal: { type: "fade" }, found: { type: "printLift", duration: 900 } });
    expect(setLook(book, "found", null)).toEqual({});
    // The content is never changed in place
    expect(book).toEqual({ found: { type: "printLift", duration: 900 } });
  });

  it("the rows come from the look's spec, ids appearance.{moment}.{name}, read like a pass's", () => {
    const book: BookAppearance = { lost: { type: "fade", outDuration: 250 } };
    const rows = rowsOf(book, "lost");
    expect(rows.map(row => row.id)).toContain("appearance.lost.outDuration");
    const out = rows.find(row => row.id === "appearance.lost.outDuration")!;
    expect(out).toMatchObject({ kind: "number", label: "disappear", unit: "ms", default: 400 });
    expect(passValue(book.lost!, out)).toBe(250);
    // Each built-in look's own defaults: fade's duration is 600, inflateDissolve's 3470
    expect(rowsOf({ found: { type: "inflateDissolve" } }, "found").find(row => row.id.endsWith(".duration"))!.default).toBe(3470);
    expect(lookRows({ type: "nobodyKnows" }, "found", builtInSpec)).toEqual([]);
  });

  it("a value set is kept, a value equal to the look's default is dropped", () => {
    const book: BookAppearance = { found: { type: "fade" } };
    const duration = rowsOf(book, "found").find(row => row.id === "appearance.found.duration")!;
    const longer = setLookValue(book, "found", duration, 900);
    expect(longer).toEqual({ found: { type: "fade", duration: 900 } });
    expect(setLookValue(longer, "found", duration, 600)).toEqual({ found: { type: "fade" } });
    const mask = rowsOf(book, "found").find(row => row.id === "appearance.found.mask")!;
    expect(setLookValue(book, "found", mask, "noise")).toEqual({ found: { type: "fade", mask: "noise" } });
    // A moment without a look of its own has no values to set
    expect(setLookValue(book, "reveal", duration, 900)).toBe(book);
  });
});

describe("the words", () => {
  it("a closed moment names its look and its values set, or where its look comes from", () => {
    const book: BookAppearance = { found: { type: "printLift", duration: 900 } };
    expect(momentSummary(book, "found", rowsOf(book, "found"))).toBe("printLift · appear 900 ms");
    expect(momentSummary({ found: { type: "fade" } }, "found", rowsOf({ found: { type: "fade" } }, "found"))).toBe("fade");
    expect(momentSummary(book, "reveal", [])).toBe("as found · printLift");
    expect(momentSummary({}, "lost", [])).toBe("default · inflateDissolve");
  });

  it("the head says the level, and default while the book names no look; the picker's empty choice", () => {
    expect(appearanceHeading({})).toBe("appearance · the whole book · default");
    expect(appearanceHeading({ lost: { type: "fade" } })).toBe("appearance · the whole book");
    expect(inheritLabel("reveal")).toBe("as found");
    expect(inheritLabel("found")).toBe("default (inflateDissolve)");
  });
});
