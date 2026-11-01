import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTriggerInfos, readTriggerInfos, TRIGGER_INFO_URL } from "../trigger-protocol";

describe("trigger protocol", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("keeps every target's fields of the right type", () => {
    expect(readTriggerInfos({
      "p038-1": { source: "a.jpg", width: 80, height: 60, position: "top left", x: 10, y: 12.5, note: "matte" },
      "p038-2": {},
    })).toEqual({
      "p038-1": { source: "a.jpg", width: 80, height: 60, position: "top left", x: 10, y: 12.5, note: "matte" },
      "p038-2": {},
    });
  });

  it("leaves out fields of the wrong type, unknown fields and targets that are no object", () => {
    expect(readTriggerInfos({
      "p001-1": { width: "80", height: Number.NaN, source: 3, extra: true, note: "kept" },
      "p001-2": "a.jpg",
      "p001-3": null,
      "p001-4": [1, 2],
    })).toEqual({ "p001-1": { note: "kept" } });
  });

  it("anything but an object is no protocol", () => {
    for (const raw of [null, undefined, 42, "x", [{ width: 1 }]]) expect(readTriggerInfos(raw)).toEqual({});
  });

  it("fetches the protocol file; a missing or broken one is empty", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ t1: { width: 50 } }), { status: 200 }));
    expect(await fetchTriggerInfos()).toEqual({ t1: { width: 50 } });
    expect(fetch).toHaveBeenCalledWith(TRIGGER_INFO_URL);

    fetch.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await fetchTriggerInfos()).toEqual({});
    fetch.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    expect(await fetchTriggerInfos()).toEqual({});
    fetch.mockRejectedValueOnce(new TypeError("offline"));
    expect(await fetchTriggerInfos()).toEqual({});
  });
});
