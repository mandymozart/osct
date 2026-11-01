import { describe, expect, it } from "vitest";
import { type ArStatus, Pages } from "@/types";
import { isCalmMoment, showNewVersionNotice } from "../new-version";

const ALL_STATUSES: ArStatus[] = ["idle", "loading", "ready", "starting", "running", "paused", "error"];

describe("the new-version notice's decision", () => {
  it("never while the camera or AR runs, starts or loads – on any page", () => {
    for (const page of Object.values(Pages)) {
      for (const status of ["loading", "starting", "running"] as ArStatus[]) {
        expect(isCalmMoment(page, status)).toBe(false);
      }
    }
  });

  it("never mid-scan: the scan view only once AR has failed", () => {
    for (const status of ALL_STATUSES.filter(status => status !== "error")) expect(isCalmMoment(Pages.SPREAD, status)).toBe(false);
    expect(isCalmMoment(Pages.SPREAD, "error")).toBe(true);
  });

  it("calm: the start, the consultation pages (entries list, entry, Info) and the overlays, with the scene paused or stopped", () => {
    for (const page of [Pages.SPLASH, Pages.ENTRIES, Pages.ENTRY, Pages.ABOUT, Pages.ERROR, Pages.NOT_FOUND]) {
      for (const status of ["idle", "ready", "paused", "error"] as ArStatus[]) expect(isCalmMoment(page, status)).toBe(true);
    }
  });

  it("not during the onboarding, and not before a page is open", () => {
    expect(isCalmMoment(Pages.TUTORIAL, "idle")).toBe(false);
    expect(isCalmMoment(null, "idle")).toBe(false);
  });

  it("shows only for out-of-date code the reader has not hidden, at a calm moment", () => {
    const calm = { page: Pages.ENTRIES, arStatus: "paused" as ArStatus };
    expect(showNewVersionNotice({ outdated: true, dismissed: false, ...calm })).toBe(true);
    expect(showNewVersionNotice({ outdated: false, dismissed: false, ...calm })).toBe(false);
    expect(showNewVersionNotice({ outdated: true, dismissed: true, ...calm })).toBe(false);
    expect(showNewVersionNotice({ outdated: true, dismissed: false, page: Pages.SPREAD, arStatus: "running" })).toBe(false);
  });
});
