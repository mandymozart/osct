import { describe, expect, it } from "vitest";
import { READY_TEXT, reloadDue, versionBar, type VersionState } from "../new-version";

const state = (patch: Partial<VersionState> = {}): VersionState => ({ ready: true, unsaved: false, waiting: false, dismissed: false, ...patch });

describe("the new-version bar: when it shows and what it says (#230)", () => {
  it("shows nothing while the running version is the deployed one, or once the person hid it", () => {
    expect(versionBar(state({ ready: false }))).toBeNull();
    expect(versionBar(state({ ready: false, unsaved: true }))).toBeNull();
    expect(versionBar(state({ dismissed: true }))).toBeNull();
    expect(versionBar(state({ dismissed: true, unsaved: true, waiting: true }))).toBeNull();
  });

  it("offers Reload when nothing is unsaved", () => {
    const bar = versionBar(state())!;
    expect(bar.text).toBe(READY_TEXT);
    expect(bar.actions.map(a => a.action)).toEqual(["reload"]);
    expect(bar.actions[0].label).toBe("Reload");
  });

  it("with unsaved edits says a reload drops them, and offers Reload after saving first", () => {
    const bar = versionBar(state({ unsaved: true }))!;
    expect(bar.text).toMatch(/drops your unsaved edits/);
    expect(bar.actions).toEqual([
      { action: "reload-after-saving", label: "Reload after saving" },
      { action: "reload", label: "Reload now" },
    ]);
  });

  it("while it waits for the save, says so and still offers Reload now", () => {
    const bar = versionBar(state({ unsaved: true, waiting: true }))!;
    expect(bar.text).toMatch(/as soon as your edits are saved/);
    expect(bar.actions.map(a => a.action)).toEqual(["reload"]);
  });
});

describe("the bar never reloads by itself unless the person chose to wait for the save (#230)", () => {
  it("does not reload for a new version alone, with or without unsaved edits", () => {
    expect(reloadDue(state())).toBe(false);
    expect(reloadDue(state({ unsaved: true }))).toBe(false);
  });

  it("waits while edits are unsaved, reloads once nothing is left unsaved", () => {
    expect(reloadDue(state({ waiting: true, unsaved: true }))).toBe(false);
    expect(reloadDue(state({ waiting: true, unsaved: false }))).toBe(true);
  });

  it("does not reload after the person hid the bar, nor without a new version", () => {
    expect(reloadDue(state({ waiting: true, dismissed: true }))).toBe(false);
    expect(reloadDue(state({ waiting: true, ready: false }))).toBe(false);
  });
});
