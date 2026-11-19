import { describe, expect, it } from "vitest";
import { APPEARANCES, type AppearanceSpec, type ExperienceAppearance } from "@engine/types";
import {
  appearanceHeading, appearanceToSave, draftAppearance, inheritLabel, lookSource, momentSummary, ownLook, playedLook, playedType, sameAppearance,
  setLook, setLookValue,
} from "../appearance-edit";
import { lookRows, passValue } from "../values";

/** The appearance panel (#265): a look per moment, a moment without one plays found's, then the default */

const builtInSpec = (type: string): AppearanceSpec | undefined => (APPEARANCES as Record<string, AppearanceSpec>)[type];
const rowsOf = (experience: ExperienceAppearance, moment: "reveal" | "found" | "lost") => (experience[moment] ? lookRows(experience[moment]!, moment, builtInSpec) : []);

describe("the experience's looks by moment", () => {
  it("a moment plays its own look, else found's, else the default", () => {
    const experience: ExperienceAppearance = { found: { type: "printLift" } };
    expect(lookSource(experience, "found")).toBe("own");
    expect(lookSource(experience, "reveal")).toBe("found");
    expect(playedType(experience, "reveal")).toBe("printLift");
    expect(lookSource({}, "lost")).toBe("default");
    expect(playedType({}, "lost")).toBe("inflateDissolve");
    // found never inherits: without a look of its own it plays the default
    expect(lookSource({ reveal: { type: "fade" } }, "found")).toBe("default");
  });

  it("the copy keeps the moments' order and never shares a look with the content", () => {
    const content: ExperienceAppearance = { lost: { type: "fade" }, reveal: { type: "printLift", duration: 900 } };
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
    const experience: ExperienceAppearance = { found: { type: "printLift", duration: 900 } };
    expect(setLook(experience, "found", "printLift")).toEqual(experience);
    expect(setLook(experience, "found", "fade")).toEqual({ found: { type: "fade" } });
    expect(setLook(experience, "reveal", "fade")).toEqual({ reveal: { type: "fade" }, found: { type: "printLift", duration: 900 } });
    expect(setLook(experience, "found", null)).toEqual({});
    // The content is never changed in place
    expect(experience).toEqual({ found: { type: "printLift", duration: 900 } });
  });

  it("the rows come from the look's spec, ids appearance.{moment}.{name}, read like a pass's", () => {
    const experience: ExperienceAppearance = { lost: { type: "fade", outDuration: 250 } };
    const rows = rowsOf(experience, "lost");
    expect(rows.map(row => row.id)).toContain("appearance.lost.outDuration");
    const out = rows.find(row => row.id === "appearance.lost.outDuration")!;
    expect(out).toMatchObject({ kind: "number", label: "disappear", unit: "ms", default: 400 });
    expect(passValue(experience.lost!, out)).toBe(250);
    // Each built-in look's own defaults: fade's duration is 600, inflateDissolve's 3470
    expect(rowsOf({ found: { type: "inflateDissolve" } }, "found").find(row => row.id.endsWith(".duration"))!.default).toBe(3470);
    expect(lookRows({ type: "nobodyKnows" }, "found", builtInSpec)).toEqual([]);
  });

  it("a value set is kept, a value equal to the look's default is dropped", () => {
    const experience: ExperienceAppearance = { found: { type: "fade" } };
    const duration = rowsOf(experience, "found").find(row => row.id === "appearance.found.duration")!;
    const longer = setLookValue(experience, "found", duration, 900);
    expect(longer).toEqual({ found: { type: "fade", duration: 900 } });
    expect(setLookValue(longer, "found", duration, 600)).toEqual({ found: { type: "fade" } });
    const mask = rowsOf(experience, "found").find(row => row.id === "appearance.found.mask")!;
    expect(setLookValue(experience, "found", mask, "noise")).toEqual({ found: { type: "fade", mask: "noise" } });
    // A moment without a look of its own takes a copy of the look it plays, with the change (#267)
    expect(setLookValue(experience, "reveal", duration, 900)).toEqual({ found: { type: "fade" }, reveal: { type: "fade", duration: 900 } });
  });
});

describe("the parameters of the look that plays (#267)", () => {
  const rowOf = (experience: ExperienceAppearance, moment: "reveal" | "found" | "lost", id: string) => {
    const row = lookRows(playedLook(experience, moment), moment, builtInSpec).find(r => r.id === `appearance.${moment}.${id}`);
    if (!row) throw new Error(`no row ${id}`);
    return row;
  };

  it("a moment plays its own look, else found's, else the default – with its values", () => {
    expect(playedLook({}, "found")).toEqual({ type: "inflateDissolve" });
    expect(playedLook({}, "reveal")).toEqual({ type: "inflateDissolve" });
    const experience: ExperienceAppearance = { found: { type: "printLift", duration: 900 }, lost: { type: "fade" } };
    expect(playedLook(experience, "reveal")).toEqual({ type: "printLift", duration: 900 });
    expect(playedLook(experience, "lost")).toEqual({ type: "fade" });
    // found never inherits
    expect(playedLook({ reveal: { type: "fade" } }, "found")).toEqual({ type: "inflateDissolve" });
  });

  it("the rows of a moment without a look of its own are those of the look it plays, at its values", () => {
    const rows = lookRows(playedLook({}, "found"), "found", builtInSpec);
    expect(rows.map(r => r.label).slice(0, 2)).toEqual(["appear", "disappear"]);
    expect(rows.length).toBeGreaterThan(20);
    expect(passValue(playedLook({}, "found") as never, rowOf({}, "found", "duration"))).toBe(3470);
    const experience: ExperienceAppearance = { found: { type: "printLift", duration: 900 } };
    expect(passValue(playedLook(experience, "reveal") as never, rowOf(experience, "reveal", "duration"))).toBe(900);
  });

  it("the first change to an inherited moment makes it its own: a copy of the look that played, with the change", () => {
    const experience: ExperienceAppearance = { found: { type: "printLift", duration: 900 } };
    const next = setLookValue(experience, "reveal", rowOf(experience, "reveal", "outDuration"), 250);
    expect(next.reveal).toEqual({ type: "printLift", duration: 900, outDuration: 250 });
    expect(next.found).toEqual({ type: "printLift", duration: 900 }); // found stays as it was
    expect(experience.reveal).toBeUndefined(); // the draft is not changed
    // found inheriting the default
    expect(setLookValue({}, "found", rowOf({}, "found", "duration"), 1200)).toEqual({ found: { type: "inflateDissolve", duration: 1200 } });
    // a moment with a look of its own changes it in place
    const own: ExperienceAppearance = { lost: { type: "fade", outDuration: 300 } };
    expect(setLookValue(own, "lost", rowOf(own, "lost", "outDuration"), 500).lost).toEqual({ type: "fade", outDuration: 500 });
    expect(ownLook(own, "lost")).toBe(own);
  });

  it("a change back to the default keeps the moment its own – the look stays named", () => {
    expect(setLookValue({}, "found", rowOf({}, "found", "duration"), 3470)).toEqual({ found: { type: "inflateDissolve" } });
  });
});

describe("the words", () => {
  it("a closed moment names its look and its values set, or where its look comes from", () => {
    const experience: ExperienceAppearance = { found: { type: "printLift", duration: 900 } };
    expect(momentSummary(experience, "found", rowsOf(experience, "found"))).toBe("printLift · appear 900 ms");
    expect(momentSummary({ found: { type: "fade" } }, "found", rowsOf({ found: { type: "fade" } }, "found"))).toBe("fade");
    expect(momentSummary(experience, "reveal", [])).toBe("as found · printLift");
    expect(momentSummary({}, "lost", [])).toBe("default · inflateDissolve");
  });

  it("the head says the level, and default while the experience names no look; the picker's empty choice", () => {
    expect(appearanceHeading({})).toBe("appearance · default");
    expect(appearanceHeading({ lost: { type: "fade" } })).toBe("appearance");
    expect(inheritLabel("reveal")).toBe("as found");
    expect(inheritLabel("found")).toBe("default (inflateDissolve)");
  });
});
