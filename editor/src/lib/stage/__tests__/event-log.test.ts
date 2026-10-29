import { describe, expect, it } from "vitest";
import { logEvent, type StageEvent } from "../event-log";

const state = (detail: string): StageEvent => ({ event: "sceneState", detail });

describe("logEvent: the Stage panel's event log", () => {
  it("puts the newest first and keeps at most the log's size", () => {
    let log: StageEvent[] = [];
    for (let i = 0; i < 5; i++) log = logEvent(log, { event: "targetFound", detail: `targetId: "t${i}"` }, 3);
    expect(log.map(e => e.detail)).toEqual(['targetId: "t4"', 'targetId: "t3"', 'targetId: "t2"']);
  });

  it("logs a scene state once per change, however often it is reported", () => {
    let log: StageEvent[] = [];
    log = logEvent(log, state('state: "running"'));
    log = logEvent(log, state('state: "running"'));
    log = logEvent(log, { event: "targetFound", detail: 'targetId: "a"' });
    log = logEvent(log, state('state: "running"'));
    expect(log.filter(e => e.event === "sceneState")).toHaveLength(1);
    log = logEvent(log, state('state: "paused"'));
    log = logEvent(log, state('state: "running"'));
    expect(log.filter(e => e.event === "sceneState").map(e => e.detail)).toEqual(['state: "running"', 'state: "paused"', 'state: "running"']);
  });

  it("keeps repeated ordinary events – each find is news", () => {
    const found = { event: "targetFound", detail: 'targetId: "a"' };
    expect(logEvent(logEvent([], found), found)).toHaveLength(2);
  });
});
