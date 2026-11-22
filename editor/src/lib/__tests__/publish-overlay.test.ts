import { describe, expect, it } from "vitest";
import type { PublishJob, PublishResult } from "@shared/api/editor";
import {
  archiveCount, confirmView, doneView, failedView, jobLog, runningView, stamp, startLog, unknownView, whenText, writtenCounts,
} from "../publish-overlay";

const result: PublishResult = { env: "staging", store: "cdn", build: "b49f09610206", hash: "b49f09610206ff", publishedAt: "2026-11-22T07:53:03.728Z", export: { path: "exports/b49f09610206", written: true } };
const job = (over: Partial<PublishJob> = {}): PublishJob => ({
  id: "j1", experience: "osct", env: "staging", status: "running", phase: "version", build: "b49f09610206", hash: "b49f09610206ff", live: false,
  done: 0, total: 1527, skipped: 0, parts: { build: 3, archive: 1522 }, startedAt: "2026-11-22T07:53:03.728Z", updatedAt: "2026-11-22T07:53:03.728Z", ...over,
});
/** Local time, as the overlay shows it */
const local = (y: number, m: number, d: number, h: number, min: number, s = 0) => new Date(y, m - 1, d, h, min, s);
const NOW = local(2026, 11, 22, 9, 30);

describe("the Publish overlay's times (#345)", () => {
  it("says a moment as near as it is, in local time", () => {
    expect(whenText(local(2026, 11, 22, 7, 53).toISOString(), NOW)).toBe("today 07:53");
    expect(whenText(local(2026, 11, 21, 18, 10).toISOString(), NOW)).toBe("yesterday 18:10");
    expect(whenText(local(2026, 11, 20, 7, 5).toISOString(), NOW)).toBe("20 Nov 07:05");
    expect(whenText(local(2025, 3, 1, 12, 0).toISOString(), NOW)).toBe("1 Mar 2025 12:00");
    expect(whenText("not a date", NOW)).toBe("not a date");
    expect(stamp(local(2026, 11, 22, 7, 53, 3))).toBe("07:53:03");
  });
});

describe("the confirm state: on point (Tilman, 2026-11-22)", () => {
  const base = { title: "Onion Skin", env: "staging", build: "1a2b3c4d5e6f", plugins: 0, problem: null };

  it("asks, says what readers get and when it was published last – no hashes", () => {
    const view = confirmView({ ...base, live: { env: "staging", build: "aaaaaaaaaaaa", since: local(2026, 11, 22, 7, 53).toISOString() } }, NOW);
    expect(view).toEqual({ heading: "Publish “Onion Skin” to staging?", readers: "Readers get this state.", last: "Last published: today 07:53", problem: null });
    expect(JSON.stringify(view)).not.toMatch(/[0-9a-f]{12}/);
  });

  it("not published there yet, a store that cannot be read, this very state already", () => {
    expect(confirmView({ ...base, live: undefined }, NOW).last).toBe("Not published on staging yet.");
    expect(confirmView({ ...base, live: "unreadable" }, NOW).last).toBe("What staging serves now cannot be read.");
    const same = { env: "staging", build: "1a2b3c4d5e6f", since: local(2026, 11, 21, 18, 10).toISOString() };
    expect(confirmView({ ...base, live: same }, NOW).last).toBe("Last published: yesterday 18:10 – staging has this state already.");
    // With plugins the published build is another than the draft's: nothing to say about "already"
    expect(confirmView({ ...base, plugins: 2, live: same }, NOW).last).toBe("Last published: yesterday 18:10");
  });

  it("production: every reader; a problem is the one danger line", () => {
    expect(confirmView({ ...base, env: "production", live: undefined }, NOW).readers).toBe("Every reader gets this state on their next start.");
    expect(confirmView({ ...base, live: undefined, problem: "The plugin glow does not compile (line 3): x" }, NOW).problem).toContain("does not compile");
  });
});

describe("the running state", () => {
  it("writing the build: no count yet – the bar is indeterminate", () => {
    expect(runningView(null)).toEqual({ heading: "Publishing…", live: "Writing the build…", archive: null, label: null });
    expect(runningView(job({ done: 2 }))).toMatchObject({ live: "Writing the build…", archive: null, label: null });
  });

  it("live for readers once switched; the archive's own count (the job's parts)", () => {
    const view = runningView(job({ phase: "archive", live: true, done: 3 + 2 + 412 }));
    expect(view).toEqual({ heading: "Publishing…", live: "Live for readers ✓", archive: { done: 412, total: 1522 }, label: "Archive 412 / 1522" });
  });

  it("a job of an older server (no parts): the whole count", () => {
    expect(archiveCount(job({ phase: "archive", live: true, done: 700, parts: undefined }))).toEqual({ done: 700, total: 1527 });
  });
});

describe("the end states", () => {
  it("done: live, what was new and what was there already", () => {
    const finished = job({ status: "done", phase: "done", live: true, done: 1527, skipped: 1524, result });
    expect(writtenCounts(finished)).toEqual({ written: 3, skipped: 1524 });
    expect(doneView("staging", finished)).toEqual({ heading: "Published", summary: "Live on staging. 3 files new, 1524 were already there.", warning: null });
    expect(doneView("staging", job({ done: 2, skipped: 1 })).summary).toBe("Live on staging. 1 file new, 1 was already there.");
    expect(doneView("staging", null).summary).toBe("Live on staging.");
    expect(doneView("staging", finished, "zone answered 500").warning).toBe("The export archive was not written: zone answered 500");
  });

  it("failed and unknown: their headings, the message as it is", () => {
    expect(failedView("The content store answered 401.")).toEqual({ heading: "Publish failed", summary: "The content store answered 401.", warning: null });
    expect(unknownView("Lost contact").heading).toBe("Publish outcome unknown");
  });
});

describe("the log behind Details", () => {
  it("starts with what used to be on the step: the target, the replaced build, the plugins", () => {
    expect(startLog({ env: "staging", target: "staging · CDN", build: "1a2b3c4d5e6f", live: { env: "staging", build: "96873173d432", since: null }, plugins: 0 }))
      .toEqual(["publish to staging · CDN – draft build 1a2b3c4d5e6f", "replaces build 96873173d432"]);
    expect(startLog({ env: "local", target: "local · this server", build: "1a2b3c4d5e6f", live: undefined, plugins: 6, warning: "No CDN connected." }))
      .toEqual(["publish to local · this server", "not published on local yet", "6 plugins transpiled, not type-checked – the build gets its name when it is published", "No CDN connected."]);
  });

  it("a line per change: the build, written, live, skipped files, the archive's count, done", () => {
    const first = job({ phase: "version", done: 1 });
    expect(jobLog(null, first)).toEqual(["build b49f09610206 – 1527 files to write or find"]);
    const live = job({ phase: "archive", live: true, done: 5 });
    expect(jobLog(first, live)).toEqual(["build written (3 files)", "live on staging", "archive 0/1522"]);
    const later = job({ phase: "archive", live: true, done: 5 + 412, skipped: 100 });
    expect(jobLog(live, later)).toEqual(["100 files already on the store, not written again", "archive 412/1522"]);
    expect(jobLog(later, later)).toEqual([]);
    const finished = job({ status: "done", phase: "done", live: true, done: 1527, skipped: 100, result });
    expect(jobLog(later, finished)).toEqual(["export archive written", "done – build b49f09610206 on staging"]);
  });

  it("a job first seen when it is done (it ended within the server's step), and a failure", () => {
    const finished = job({ status: "done", phase: "done", live: true, done: 1527, skipped: 1527, result: { ...result, export: { path: "exports/x", written: false } } });
    expect(jobLog(null, finished)).toEqual([
      "build b49f09610206 – 1527 files to write or find", "build written (3 files)", "live on staging", "1527 files already on the store, not written again",
      "export archive was there already", "done – build b49f09610206 on staging",
    ]);
    const failed = job({ status: "failed", error: { code: "content-store-failed", message: "The content store answered 401.", status: 502 } });
    expect(jobLog(job(), failed)).toEqual(["failed: The content store answered 401. (content-store-failed)"]);
  });
});
