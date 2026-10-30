import { describe, expect, it } from "vitest";
import { ApiError, type RemovalFile, type RemovalImpact } from "../api";
import {
  deleteFilesLabel, elsewhereLine, filesLine, keptEntitiesLine, onlyHereNames, pagesLine, removalHeadline, removalStep, removedName, removeLabel,
} from "../removal";

const file = (name: string, usedBy?: RemovalFile["usedBy"]): RemovalFile => ({ id: name, name, kind: "image", size: 1, url: `https://cdn.example/${name}`, ...(usedBy ? { usedBy } : {}) });

/** The impact of spread 4–5: 3 entries, 3 targets, 2 entities; castle kept; two files only here, one elsewhere */
const spreadImpact = (over: Partial<RemovalImpact> = {}): RemovalImpact => ({
  book: "osct",
  kind: "spread",
  spread: { id: "s4", title: "Four", firstPage: 4, lastPage: 5, format: "spread" },
  pagesBack: 2,
  entries: [{ id: "a", title: "A", page: 4, category: "video" }, { id: "b", title: "B", page: 5, category: "video" }, { id: "c", title: "C", page: 5, category: "video" }],
  targets: [{ id: "a", entry: "a", imageSrc: "x" }, { id: "b", entry: "b", imageSrc: "y" }, { id: "c", entry: "c", imageSrc: "z" }],
  entities: [{ ref: "lamp", type: "model", shared: true, targets: ["c"] }, { ref: null, type: "image", shared: false, targets: ["b"] }],
  keptEntities: [{ ref: "castle", type: "video", targets: ["a"], usedBy: ["castle-target"] }],
  files: { onlyHere: [file("a-only.png"), file("b-only.png")], elsewhere: [file("shared.png", [{ kind: "target", ref: "e4" }])] },
  counts: { entries: 3, targets: 3, entities: 2, keptEntities: 1, filesOnlyHere: 2, filesElsewhere: 1 },
  ...over,
});

const entryImpact = (): RemovalImpact => ({
  ...spreadImpact(),
  kind: "entry",
  spread: undefined,
  entry: { id: "castle", title: "Castle", page: 3, category: "video", spread: "s2" },
  pagesBack: 0,
  entries: [{ id: "castle", title: "Castle", page: 3, category: "video" }],
  targets: [{ id: "castle-target", entry: "castle", imageSrc: "x" }],
  entities: [{ ref: null, type: "video", shared: false, targets: ["castle-target"] }],
  keptEntities: [],
  files: { onlyHere: [file("castle.png")], elsewhere: [] },
  counts: { entries: 1, targets: 1, entities: 1, keptEntities: 0, filesOnlyHere: 1, filesElsewhere: 0 },
});

const confirmation = { id: "1900000000.0123456789abcdef0123456789abcdef", expiresAt: "2030-03-17T17:46:40Z" };

describe("removing with everything on it – the confirmation's words (#198)", () => {
  it("reads the API's first step and a void confirmation as the step to confirm; anything else is no step", () => {
    const impact = spreadImpact();
    expect(removalStep(new ApiError(409, "confirm-delete", "Removing takes …", { impact, confirmation }))).toEqual({ impact, confirmation, changed: false });
    expect(removalStep(new ApiError(409, "confirmation-void", "void", { impact, confirmation }))).toEqual({ impact, confirmation, changed: true });
    expect(removalStep(new ApiError(409, "initial-spread", "The book opens on this spread."))).toBeNull();
    expect(removalStep(new ApiError(409, "confirm-delete", "no details"))).toBeNull();
    expect(removalStep(new Error("network"))).toBeNull();
  });

  it("says what goes: the spread by its pages, with entries, targets and entities", () => {
    expect(removalHeadline(spreadImpact())).toBe("Removes spread 4–5 with 3 entries, 3 targets, 2 entities.");
    expect(removalHeadline(spreadImpact({ counts: { entries: 1, targets: 0, entities: 0, keptEntities: 0, filesOnlyHere: 0, filesElsewhere: 0 } }))).toBe("Removes spread 4–5 with 1 entry.");
    expect(removalHeadline(spreadImpact({ counts: { entries: 0, targets: 0, entities: 0, keptEntities: 0, filesOnlyHere: 0, filesElsewhere: 0 } }))).toBe("Removes spread 4–5.");
    expect(removedName(spreadImpact({ spread: { id: "cover", title: "Cover", firstPage: 0, lastPage: 0, format: "cover" } }))).toBe("the cover");
    expect(removedName(spreadImpact({ spread: { id: "back", title: "Back", firstPage: 9, lastPage: 9, format: "back" } }))).toBe("the back cover");
    expect(removalHeadline(entryImpact())).toBe("Removes entry “Castle” (page 3) with 1 target, 1 entity.");
  });

  it("tells about the later pages and the shared entities that stay", () => {
    expect(pagesLine(spreadImpact())).toBe("The pages after it are numbered back by 2.");
    expect(pagesLine(entryImpact())).toBeNull();
    expect(keptEntitiesLine(spreadImpact())).toBe("Kept: entity castle (also on castle-target).");
    expect(keptEntitiesLine(entryImpact())).toBeNull();
  });

  it("keeps the Library files unless the option is on; files used elsewhere are always kept", () => {
    const impact = spreadImpact();
    expect(filesLine(impact, false)).toBe("Library files are kept.");
    expect(deleteFilesLabel(impact)).toBe("Also delete the 2 files used only here");
    expect(onlyHereNames(impact)).toBe("a-only.png, b-only.png");
    expect(filesLine(impact, true)).toBe("2 Library files used only here are deleted, the others are kept.");
    expect(elsewhereLine(impact)).toBe("Kept, used elsewhere: shared.png.");
    expect(deleteFilesLabel(entryImpact())).toBe("Also delete the file used only here");
    expect(filesLine(entryImpact(), true)).toBe("1 Library file used only here is deleted.");
    expect(elsewhereLine(entryImpact())).toBeNull();
    const none = spreadImpact({ files: { onlyHere: [], elsewhere: [] } });
    expect(deleteFilesLabel(none)).toBeNull();
    expect(filesLine(none, true)).toBe("Library files are kept.");
  });

  it("names the button after what goes", () => {
    expect(removeLabel(spreadImpact())).toBe("Remove spread 4–5");
    expect(removeLabel(entryImpact())).toBe("Remove the entry");
  });
});
