import { describe, expect, it } from "vitest";
import { ApiError, type RemovalFile, type RemovalImpact } from "../api";
import {
  deleteFilesLabel, elsewhereLine, filesLine, keptEntitiesLine, onlyHereNames, removalHeadline, removalStep, removedName, removeLabel,
} from "../removal";

const file = (name: string, usedBy?: RemovalFile["usedBy"]): RemovalFile => ({ id: name, name, kind: "image", size: 1, url: `https://cdn.example/${name}`, ...(usedBy ? { usedBy } : {}) });

/** The impact of the scene “4–5”: 3 entries, 3 targets, 2 entities; castle kept; two files only here, one elsewhere */
type SceneImpact = Extract<RemovalImpact, { kind: "scene" }>;
const sceneImpact = (over: Partial<SceneImpact> = {}): SceneImpact => ({
  book: "osct",
  kind: "scene",
  scene: { id: "s4", label: "4–5" },
  entries: [{ id: "a", title: "A", scene: "s4", category: "video" }, { id: "b", title: "B", scene: "s4", category: "video" }, { id: "c", title: "C", scene: "s4", category: "video" }],
  targets: [{ id: "a", entry: "a", imageSrc: "x" }, { id: "b", entry: "b", imageSrc: "y" }, { id: "c", entry: "c", imageSrc: "z" }],
  entities: [{ ref: "lamp", type: "model", shared: true, targets: ["c"] }, { ref: null, type: "image", shared: false, targets: ["b"] }],
  keptEntities: [{ ref: "castle", type: "video", targets: ["a"], usedBy: ["castle-target"] }],
  files: { onlyHere: [file("a-only.png"), file("b-only.png")], elsewhere: [file("shared.png", [{ kind: "target", ref: "e4" }])] },
  counts: { entries: 3, targets: 3, entities: 2, keptEntities: 1, filesOnlyHere: 2, filesElsewhere: 1 },
  ...over,
});

const entryImpact = (): RemovalImpact => ({
  book: "osct",
  kind: "entry",
  entry: { id: "castle", title: "Castle", category: "video", scene: "s2" },
  entries: [{ id: "castle", title: "Castle", scene: "s2", category: "video" }],
  targets: [{ id: "castle-target", entry: "castle", imageSrc: "x" }],
  entities: [{ ref: null, type: "video", shared: false, targets: ["castle-target"] }],
  keptEntities: [],
  files: { onlyHere: [file("castle.png")], elsewhere: [] },
  counts: { entries: 1, targets: 1, entities: 1, keptEntities: 0, filesOnlyHere: 1, filesElsewhere: 0 },
});

const confirmation = { id: "1900000000.0123456789abcdef0123456789abcdef", expiresAt: "2030-03-17T17:46:40Z" };

describe("removing with everything on it – the confirmation's words (#198)", () => {
  it("reads the API's first step and a void confirmation as the step to confirm; anything else is no step", () => {
    const impact = sceneImpact();
    expect(removalStep(new ApiError(409, "confirm-delete", "Removing takes …", { impact, confirmation }))).toEqual({ impact, confirmation, changed: false });
    expect(removalStep(new ApiError(409, "confirmation-void", "void", { impact, confirmation }))).toEqual({ impact, confirmation, changed: true });
    expect(removalStep(new ApiError(409, "initial-scene", "The book opens on this scene."))).toBeNull();
    expect(removalStep(new ApiError(409, "confirm-delete", "no details"))).toBeNull();
    expect(removalStep(new Error("network"))).toBeNull();
  });

  it("says what goes: the scene by its label, with entries, targets and entities", () => {
    expect(removalHeadline(sceneImpact())).toBe("Removes scene “4–5” with 3 entries, 3 targets, 2 entities.");
    expect(removalHeadline(sceneImpact({ counts: { entries: 1, targets: 0, entities: 0, keptEntities: 0, filesOnlyHere: 0, filesElsewhere: 0 } }))).toBe("Removes scene “4–5” with 1 entry.");
    expect(removalHeadline(sceneImpact({ counts: { entries: 0, targets: 0, entities: 0, keptEntities: 0, filesOnlyHere: 0, filesElsewhere: 0 } }))).toBe("Removes scene “4–5”.");
    expect(removedName(sceneImpact({ scene: { id: "wall", label: "" } }))).toBe("scene “wall”");
    expect(removalHeadline(entryImpact())).toBe("Removes entry “Castle” with 1 target, 1 entity.");
  });

  it("tells about the shared entities that stay", () => {
    expect(keptEntitiesLine(sceneImpact())).toBe("Kept: entity castle (also on castle-target).");
    expect(keptEntitiesLine(entryImpact())).toBeNull();
  });

  it("keeps the Library files unless the option is on; files used elsewhere are always kept", () => {
    const impact = sceneImpact();
    expect(filesLine(impact, false)).toBe("Library files are kept.");
    expect(deleteFilesLabel(impact)).toBe("Also delete the 2 files used only here");
    expect(onlyHereNames(impact)).toBe("a-only.png, b-only.png");
    expect(filesLine(impact, true)).toBe("2 Library files used only here are deleted, the others are kept.");
    expect(elsewhereLine(impact)).toBe("Kept, used elsewhere: shared.png.");
    expect(deleteFilesLabel(entryImpact())).toBe("Also delete the file used only here");
    expect(filesLine(entryImpact(), true)).toBe("1 Library file used only here is deleted.");
    expect(elsewhereLine(entryImpact())).toBeNull();
    const none = sceneImpact({ files: { onlyHere: [], elsewhere: [] } });
    expect(deleteFilesLabel(none)).toBeNull();
    expect(filesLine(none, true)).toBe("Library files are kept.");
  });

  it("names the button after what goes", () => {
    expect(removeLabel(sceneImpact())).toBe("Remove scene “4–5”");
    expect(removeLabel(entryImpact())).toBe("Remove the entry");
  });
});
