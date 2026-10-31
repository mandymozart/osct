import { describe, expect, it } from "vitest";
import { describePayload, formatElapsed, logEvent, type StageEvent } from "../event-log";

const state = (detail: string, at = 0): StageEvent => ({ event: "sceneState", detail, at });

describe("logEvent: the Inspector's event timeline", () => {
  it("puts the newest first and keeps at most the log's size", () => {
    let log: StageEvent[] = [];
    for (let i = 0; i < 5; i++) log = logEvent(log, { event: "targetFound", detail: `targetId: "t${i}"`, at: i * 100 }, 3);
    expect(log.map(e => e.detail)).toEqual(['targetId: "t4"', 'targetId: "t3"', 'targetId: "t2"']);
    expect(log.map(e => e.at)).toEqual([400, 300, 200]);
  });

  it("logs a scene state once per change, however often it is reported", () => {
    let log: StageEvent[] = [];
    log = logEvent(log, state('state: "running"'));
    log = logEvent(log, state('state: "running"', 50));
    log = logEvent(log, { event: "targetFound", detail: 'targetId: "a"', at: 60 });
    log = logEvent(log, state('state: "running"', 70));
    expect(log.filter(e => e.event === "sceneState")).toHaveLength(1);
    log = logEvent(log, state('state: "paused"'));
    log = logEvent(log, state('state: "running"'));
    expect(log.filter(e => e.event === "sceneState").map(e => e.detail)).toEqual(['state: "running"', 'state: "paused"', 'state: "running"']);
  });

  it("keeps repeated ordinary events – each find is news", () => {
    const found = { event: "targetFound", detail: 'targetId: "a"', at: 0 };
    expect(logEvent(logEvent([], found), found)).toHaveLength(2);
  });
});

describe("describePayload: an event's payload as one line", () => {
  it("lists an object's fields as JSON values, a deleted variable's value as a dash", () => {
    expect(describePayload({ targetId: "key" })).toBe('targetId: "key"');
    expect(describePayload({ name: "hasKey", scope: "book", value: undefined, previous: true })).toBe('name: "hasKey" · scope: "book" · value: – · previous: true');
  });

  it("is empty without a payload and plain text for a scalar", () => {
    expect(describePayload(undefined)).toBe("");
    expect(describePayload(3)).toBe("3");
    expect(describePayload(null)).toBe("null");
  });
});

describe("formatElapsed: the time since the spread opened", () => {
  it("shows seconds with hundredths under a minute", () => {
    expect(formatElapsed(0)).toBe("0.00 s");
    expect(formatElapsed(4250)).toBe("4.25 s");
    expect(formatElapsed(59_994)).toBe("59.99 s");
  });

  it("shows minutes and seconds with tenths from a minute on, never 60 seconds", () => {
    expect(formatElapsed(59_996)).toBe("1:00.0");
    expect(formatElapsed(65_300)).toBe("1:05.3");
    expect(formatElapsed(119_970)).toBe("2:00.0");
    expect(formatElapsed(754_000)).toBe("12:34.0");
  });

  it("counts a time before the origin as zero", () => {
    expect(formatElapsed(-20)).toBe("0.00 s");
  });
});
