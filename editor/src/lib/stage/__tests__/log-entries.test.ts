import { afterEach, describe, expect, it } from "vitest";
import type { StageEvent } from "../event-log";
import type { StageLog } from "../stage-types";
import {
  countKinds, eventEntry, filterLog, listSummary, LOG_KINDS, mergeLog, narrativeSummary, pluginEntry, problemsSummary, readLogFilter, toggleLogKind,
  writeLogFilter, type LogKind,
} from "../log-entries";

const ev = (event: string, t: number, detail = ""): StageEvent => ({ event, detail, at: t - 1000, t });
const line = (text: string, t?: number, level: StageLog["level"] = "info"): StageLog => ({ level, text, ...(t === undefined ? {} : { t, at: t - 1000 }) });

describe("the Log tab's timeline (#337)", () => {
  it("splits the rules' lines (behaviour, goto) from the stage's events", () => {
    expect(eventEntry(ev("targetFound", 1100)).kind).toBe("event");
    expect(eventEntry(ev("behaviour", 1100)).kind).toBe("behaviour");
    expect(eventEntry(ev("goto", 1100, "scene:door")).kind).toBe("behaviour");
    expect(eventEntry(ev("goto", 1100, "scene:door"))).toMatchObject({ at: 100, line: "goto", detail: "scene:door", failed: false });
  });

  it("takes a plugin's line with its level, an error marked failed", () => {
    expect(pluginEntry(line("[plugin fx] hello", 1200))).toEqual({ kind: "plugin", at: 200, line: "info", detail: "[plugin fx] hello", failed: false });
    expect(pluginEntry(line("Uncaught x", 1300, "error")).failed).toBe(true);
    expect(pluginEntry(line("no clock")).at).toBeNull();
  });

  it("merges the events (newest first) and the plugins' lines (newest last) by the page's clock, newest first", () => {
    const events = [ev("varChanged", 1500), ev("behaviour", 1300), ev("targetFound", 1100)];
    const logs = [line("a", 1000), line("b", 1200), line("c", 1600)];
    expect(mergeLog(events, logs).map(e => (e.kind === "plugin" ? e.detail : e.line))).toEqual(["c", "varChanged", "behaviour", "b", "targetFound", "a"]);
  });

  it("puts lines without a clock last, each list in its own order", () => {
    const events: StageEvent[] = [{ event: "old", detail: "", at: 5 }];
    expect(mergeLog(events, [line("x"), line("y", 10)]).map(e => e.detail || e.line)).toEqual(["y", "old", "x"]);
    expect(mergeLog([], [])).toEqual([]);
  });

  it("shows only the kinds picked; a chip toggles", () => {
    const rows: { kind: LogKind; n: number }[] = [{ kind: "event", n: 1 }, { kind: "plugin", n: 2 }, { kind: "error", n: 3 }, { kind: "warning", n: 4 }];
    expect(filterLog(rows, new Set<LogKind>(["plugin", "warning"])).map(r => r.n)).toEqual([2, 4]);
    expect(filterLog(rows, new Set<LogKind>())).toEqual([]);
    const shown = new Set<LogKind>(["event"]);
    expect([...toggleLogKind(shown, "error")].sort()).toEqual(["error", "event"]);
    expect([...toggleLogKind(shown, "event")]).toEqual([]);
    expect([...shown]).toEqual(["event"]);
  });

  it("counts each kind for the chips", () => {
    expect(countKinds([{ kind: "event" }, { kind: "event" }, { kind: "warning" }])).toEqual({ event: 2, behaviour: 0, plugin: 0, error: 0, warning: 1 });
  });
});

describe("the scene Inspector's narrative line (#337)", () => {
  it("counts vars and events in words", () => {
    expect(narrativeSummary(3, 12)).toBe("3 vars · 12 events");
    expect(narrativeSummary(1, 1)).toBe("1 var · 1 event");
    expect(narrativeSummary(0, 0)).toBe("no vars · no events");
  });
});

describe("the Log tab's chips in this browser", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("shows every kind when nothing is stored, keeps the choice, drops what it does not know", () => {
    expect([...readLogFilter()]).toEqual([...LOG_KINDS]);
    writeLogFilter(new Set<LogKind>(["warning", "event"]));
    expect([...readLogFilter()]).toEqual(["event", "warning"]);
    localStorage.setItem("osct-editor-log-filter", JSON.stringify(["event", "nonsense", 4]));
    expect([...readLogFilter()]).toEqual(["event"]);
    localStorage.setItem("osct-editor-log-filter", "{not json");
    expect([...readLogFilter()]).toEqual([...LOG_KINDS]);
  });
});

describe("the summaries of closed sections (#337)", () => {
  it("names the problems' counts by severity and the first error", () => {
    expect(problemsSummary([])).toBe("none");
    expect(problemsSummary([
      { kind: "warning", place: "door", text: "is never heard" },
      { kind: "error", place: "", text: "an event nothing emits" },
      { kind: "warning", place: "", text: "x" },
    ])).toBe("1 error · 2 warnings – an event nothing emits");
    expect(problemsSummary([{ kind: "warning", place: "door", text: "is never heard" }])).toBe("1 warning – door is never heard");
  });

  it("counts a list and names its first few", () => {
    expect(listSummary([])).toBe("none");
    expect(listSummary(["a", "b"])).toBe("2 · a, b");
    expect(listSummary(["a", "b", "c", "d"])).toBe("4 · a, b, c, …");
  });
});
