import { describe, expect, it } from "vitest";
import type { PublishJob, PublishResult } from "@shared/api/editor";
import { ApiError } from "../api";
import { isLostAnswer, POLL_FAILURES, runPublish, type PublishCalls } from "../publish-job";

const result: PublishResult = { env: "staging", store: "cdn", build: "b49f09610206", hash: "b49f09610206ff", publishedAt: "2026-11-22T07:53:03.728Z", export: { path: "exports/b49f09610206", written: true } };
const job = (over: Partial<PublishJob> = {}): PublishJob => ({
  id: "j1", experience: "osct", env: "staging", status: "running", phase: "version", build: "b49f09610206", hash: "b49f09610206ff", live: false,
  done: 0, total: 1531, skipped: 0, startedAt: "2026-11-22T07:53:03.728Z", updatedAt: "2026-11-22T07:53:03.728Z", ...over,
});
const done = (over: Partial<PublishJob> = {}) => job({ status: "done", phase: "done", live: true, done: 1531, result, ...over });
const gateway = () => new ApiError(504, "unknown", "Gateway Timeout");

/** Calls that answer from lists, recording what the dialog saw */
const calls = (over: Partial<PublishCalls> & { polls?: Array<PublishJob | Error>; latests?: Array<PublishJob | null> }) => {
  const seen: PublishJob[] = [];
  const polls = [...(over.polls ?? [])];
  const latests = [...(over.latests ?? [])];
  const value: PublishCalls = {
    start: over.start ?? (async () => ({ job: job() })),
    poll: async () => {
      const next = polls.shift();
      if (!next) throw new Error("no more polls");
      if (next instanceof Error) throw next;
      return { job: next };
    },
    latest: async () => ({ job: latests.length ? latests.shift() ?? null : null }),
    progress: j => seen.push(j),
    wait: async () => {},
  };
  return { value, seen };
};

describe("a publish job in the dialog (#345)", () => {
  it("done within the server's step: the outcome at once, no poll", async () => {
    const { value, seen } = calls({ start: async () => ({ ...result, job: done() }) });
    expect(await runPublish(value, null)).toEqual({ kind: "done", result, job: done() });
    expect(seen).toEqual([]);
  });

  it("202: follows the job, every poll's progress shown, then the outcome", async () => {
    const { value, seen } = calls({ polls: [job({ done: 40 }), job({ phase: "archive", live: true, done: 700 }), done()] });
    const outcome = await runPublish(value, null);
    expect(outcome).toEqual({ kind: "done", result, job: done() });
    expect(seen.map(j => j.done)).toEqual([0, 40, 700, 1531]);
  });

  it("a failed job: its message and code – a failure only the server reported", async () => {
    const failed = job({ status: "failed", error: { code: "content-store-failed", message: "The content store answered 401 for PUT osct/staging/osct/b49f09610206/files.json.", status: 502 } });
    const { value } = calls({ polls: [failed] });
    expect(await runPublish(value, null)).toMatchObject({ kind: "failed", message: "The content store answered 401 for PUT osct/staging/osct/b49f09610206/files.json. (content-store-failed)" });
  });

  it("an error the API answered (409 unknown-components, 403): failed with its message, nothing to follow", async () => {
    const { value } = calls({ start: async () => { throw new ApiError(409, "unknown-components", "Nodes use components no compiled plugin provides: tint."); } });
    expect(await runPublish(value, null)).toEqual({ kind: "failed", message: "Nodes use components no compiled plugin provides: tint. (unknown-components)", job: null });
  });

  it("a gateway's 504 on the start is no failure: the new job of the experience is followed to its end", async () => {
    const { value, seen } = calls({
      start: async () => { throw gateway(); },
      latests: [job({ id: "older", status: "done" }), job({ id: "j2", phase: "archive", live: true, done: 900 })],
      polls: [done({ id: "j2" })],
    });
    const outcome = await runPublish(value, "older");
    expect(outcome.kind).toBe("done");
    expect(seen[0]).toMatchObject({ id: "j2", done: 900 });
  });

  it("a lost start with no new job: the outcome is unknown – said so, not called a failure", async () => {
    const { value } = calls({ start: async () => { throw gateway(); }, latests: [job({ id: "older", status: "done" })] });
    const outcome = await runPublish(value, "older");
    expect(outcome.kind).toBe("unknown");
    expect(outcome.kind === "unknown" && outcome.message).toContain("did not answer (504)");
  });

  it("409 publish-running: follows the publish that runs", async () => {
    const { value } = calls({
      start: async () => { throw new ApiError(409, "publish-running", "A publish of this experience is running.", { job: job({ id: "other", done: 300 }) }); },
      polls: [done({ id: "other" })],
    });
    expect(await runPublish(value, null)).toMatchObject({ kind: "done", job: { id: "other" } });
  });

  it("polls that fail on the way (a gateway, the network) are tried again; too many in a row: unknown, it may still run", async () => {
    const { value } = calls({ polls: [gateway(), new TypeError("Failed to fetch"), done()] });
    expect((await runPublish(value, null)).kind).toBe("done");
    const lost = calls({ polls: Array.from({ length: POLL_FAILURES }, gateway) });
    const outcome = await runPublish(lost.value, null);
    expect(outcome.kind).toBe("unknown");
    expect(outcome.kind === "unknown" && outcome.message).toContain("may still be running");
  });

  it("tells a lost answer from the API's own errors", () => {
    expect(isLostAnswer(gateway())).toBe(true);
    expect(isLostAnswer(new ApiError(502, "unknown", "Bad Gateway"))).toBe(true);
    expect(isLostAnswer(new TypeError("Failed to fetch"))).toBe(true);
    expect(isLostAnswer(new ApiError(502, "content-store-failed", "The content store answered 401."))).toBe(false);
    expect(isLostAnswer(new ApiError(409, "unknown-components", "…"))).toBe(false);
  });
});
