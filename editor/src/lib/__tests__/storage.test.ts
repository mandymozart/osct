import { afterEach, describe, expect, it, vi } from "vitest";
import { readStored, readStoredJson, writeStored, writeStoredJson } from "../storage";

describe("the editor's settings in localStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("writes and reads text under the key as it is; null removes it", () => {
    writeStored("osct-editor-tab", "library");
    expect(localStorage.getItem("osct-editor-tab")).toBe("library");
    expect(readStored("osct-editor-tab")).toBe("library");
    writeStored("osct-editor-tab", null);
    expect(localStorage.getItem("osct-editor-tab")).toBeNull();
    expect(readStored("osct-editor-tab")).toBeNull();
  });

  it("writes and reads JSON; what does not parse reads as nothing stored", () => {
    writeStoredJson("osct-editor-widths", { tree: 280 });
    expect(localStorage.getItem("osct-editor-widths")).toBe('{"tree":280}');
    expect(readStoredJson("osct-editor-widths")).toEqual({ tree: 280 });
    localStorage.setItem("osct-editor-widths", "{not json");
    expect(readStoredJson("osct-editor-widths")).toBeUndefined();
    expect(readStoredJson("osct-editor-sections")).toBeUndefined();
  });

  it("blocked storage reads as nothing stored and drops the write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(readStored("osct-preview")).toBeNull();
    expect(readStoredJson("osct-preview")).toBeUndefined();
    expect(() => writeStoredJson("osct-preview", { grid: true })).not.toThrow();
  });
});
