import { describe, expect, it } from "vitest";
import {
  backToExperience, draftPasses, editInEffect, effectivePasses, levelLine, ownPasses, passesHeading, passesSource, passSummary, pendingSaves,
  setPassEnabled, scenesOnExperience,
} from "../passes-edit";
import type { PassData } from "@engine/types";
import { passRows } from "../values";

const EXPERIENCE = [{ type: "grade", reach: "all", exposure: 0.5 }, { type: "vignette" }];

// The post-processing panel: the experience's passes are the master, a scene's own list overrides them
describe("the experience's passes and a scene's override", () => {
  it("a scene without a list of its own uses the experience's", () => {
    const draft = draftPasses(EXPERIENCE, undefined);
    expect(passesSource(draft)).toBe("experience");
    expect(effectivePasses(draft)).toEqual(EXPERIENCE);
    expect(passesHeading(draft)).toBe("post-processing · the whole experience");
    expect(passesHeading(draftPasses(null, undefined))).toBe("post-processing · the whole experience · none");
  });

  it("starts from copies – the loaded content is never edited", () => {
    const draft = draftPasses(EXPERIENCE, undefined);
    expect(draft.experience).not.toBe(EXPERIENCE);
    expect(draft.experience[0]).not.toBe(EXPERIENCE[0]);
  });

  it("own passes for this scene start as a copy of the experience's", () => {
    const own = ownPasses(draftPasses(EXPERIENCE, undefined));
    expect(passesSource(own)).toBe("scene");
    expect(own.own).toEqual(EXPERIENCE);
    expect(own.own![0]).not.toBe(own.experience[0]);
    expect(passesHeading(own)).toBe("post-processing · only this scene");
    expect(passesHeading({ ...own, own: [] })).toBe("post-processing · only this scene · off");
  });

  it("editing changes the list in effect: the experience's while the scene uses them, else the scene's own", () => {
    const usesExperience = editInEffect(draftPasses(EXPERIENCE, undefined), list => [...list, { type: "bloom" }]);
    expect(usesExperience.experience.map(p => p.type)).toEqual(["grade", "vignette", "bloom"]);
    expect(usesExperience.own).toBeNull();
    const own = editInEffect(ownPasses(draftPasses(EXPERIENCE, undefined)), list => list.slice(1));
    expect(own.own!.map(p => p.type)).toEqual(["vignette"]);
    expect(own.experience).toEqual(EXPERIENCE);
  });

  it("back to the experience's drops the override", () => {
    const back = backToExperience(draftPasses(EXPERIENCE, [{ type: "bloom" }]));
    expect(back.own).toBeNull();
    expect(effectivePasses(back)).toEqual(EXPERIENCE);
  });

  it("Save writes only what changed", () => {
    const saved = draftPasses(EXPERIENCE, undefined);
    expect(pendingSaves(saved, saved)).toEqual({});
    expect(pendingSaves(ownPasses(saved), saved)).toEqual({ scene: EXPERIENCE });
    const experienceEdited = editInEffect(saved, list => [...list, { type: "bloom" }]);
    expect(pendingSaves(experienceEdited, saved)).toEqual({ experience: [...EXPERIENCE, { type: "bloom" }] });
    // An empty experience list removes the field; the scene back to the experience's sends null
    expect(pendingSaves(editInEffect(saved, () => []), saved)).toEqual({ experience: null });
    const withOwn = draftPasses(EXPERIENCE, [{ type: "bloom" }]);
    expect(pendingSaves(backToExperience(withOwn), withOwn)).toEqual({ scene: null });
    // An empty list of its own is kept: post-processing off for this scene
    expect(pendingSaves(editInEffect(withOwn, () => []), withOwn)).toEqual({ scene: [] });
  });
});

// The level at a glance (#181): what editing changes, and what Save saves
describe("the level in words", () => {
  const SCENES = [{ id: "a" }, { id: "b", passes: [{ type: "bloom" }] }, { id: "c", passes: null }, { id: "d", passes: [] }];

  it("counts the scenes that use the experience's – an empty list of its own is an override too", () => {
    expect(scenesOnExperience(SCENES, "a", null)).toBe(2);
    expect(scenesOnExperience([], "a", null)).toBe(0);
  });

  it("counts the scene on the stage as the panel holds it, saved or not", () => {
    expect(scenesOnExperience(SCENES, "a", [])).toBe(1);
    expect(scenesOnExperience(SCENES, "b", null)).toBe(3);
  });

  it("says what editing the list changes", () => {
    const experience = draftPasses(EXPERIENCE, undefined);
    expect(levelLine(experience, 4)).toBe("changes all 4 scenes that use the experience's");
    expect(levelLine(experience, 1)).toBe("changes the 1 scene that uses the experience's");
    expect(levelLine(ownPasses(experience), 4)).toBe("overrides the experience's for this scene");
  });
});

// Each pass its own section with an on/off toggle in its head (#233)
describe("a pass on and off, and its closed head", () => {
  it("off keeps the pass, its place and its values – on drops the field again", () => {
    const list = [{ type: "bloom", strength: 0.35 }, { type: "vignette" }];
    const off = setPassEnabled(list, 0, false);
    expect(off).toEqual([{ type: "bloom", strength: 0.35, enabled: false }, { type: "vignette" }]);
    expect(list[0]).toEqual({ type: "bloom", strength: 0.35 });
    expect(setPassEnabled(off, 0, true)).toEqual(list);
    expect(setPassEnabled(list, 1, true)).toEqual(list);
  });

  it("switching a pass of the experience's list changes the experience's, a scene's own the scene's – Save writes it", () => {
    const draft = draftPasses(EXPERIENCE, undefined);
    const next = editInEffect(draft, list => setPassEnabled(list, 1, false));
    expect(next.experience[1]).toEqual({ type: "vignette", enabled: false });
    expect(pendingSaves(next, draft)).toEqual({ experience: [EXPERIENCE[0], { type: "vignette", enabled: false }] });
    expect(editInEffect(ownPasses(draft), list => setPassEnabled(list, 0, false)).own![0].enabled).toBe(false);
  });

  it("the level's head says when every pass is off", () => {
    expect(passesHeading(draftPasses([{ type: "bloom", enabled: false }], undefined))).toBe("post-processing · the whole experience · all off");
    expect(passesHeading(draftPasses([{ type: "bloom", enabled: false }, { type: "grade" }], undefined))).toBe("post-processing · the whole experience");
  });

  it("a closed pass names the values set, at most two – else its first parameter", () => {
    const summary = (pass: PassData) => passSummary(pass, passRows(pass, 0));
    expect(summary({ type: "bloom", strength: 0.35 })).toBe("strength 0.35");
    expect(summary({ type: "bloom" })).toBe("strength 1");
    expect(summary({ type: "bloom", strength: 0.35, radius: 0.6, threshold: 0.5 })).toBe("strength 0.35 · radius 0.6");
    expect(summary({ type: "grade", reach: "all", exposure: 0.5 })).toBe("reach whole picture · exposure 0.5 EV");
    expect(summary({ type: "vignette", color: "#102030", enabled: false })).toBe("color #102030");
    expect(passSummary({ type: "unknownPass" }, [])).toBeUndefined();
  });
});
