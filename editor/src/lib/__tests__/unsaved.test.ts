import { describe, expect, it } from "vitest";
import { hasUnsaved, trackUnsaved } from "../unsaved";

describe("the editor's unsaved edits in one place (#230)", () => {
  it("is unsaved while any registered panel is dirty, and forgets a panel that goes", () => {
    let codeDirty = false;
    let passesDirty = false;
    const offCode = trackUnsaved(() => codeDirty);
    const offPasses = trackUnsaved(() => passesDirty);
    expect(hasUnsaved()).toBe(false);
    passesDirty = true;
    expect(hasUnsaved()).toBe(true);
    codeDirty = true;
    offPasses();
    expect(hasUnsaved()).toBe(true);
    offCode();
    expect(hasUnsaved()).toBe(false);
  });
});
