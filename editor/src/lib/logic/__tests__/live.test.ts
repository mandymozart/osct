import { describe, expect, it } from "vitest";
import { describePayload } from "../../stage/event-log";
import { flowOf } from "../flow";
import { LIVE_MS, addHit, emptyLive, freshLines, liveHit, liveIndex, markSeen, nodeNames, parseDetail, prune, valueWords } from "../live";
import { project } from "../project";
import type { Context } from "../types";
import { content } from "./fixture";

const indexAt = (context: Context, canvas?: Parameters<typeof flowOf>[1]) => {
  const view = project(content, context);
  return liveIndex(view, flowOf(view, canvas), { nodeName: () => "" });
};
const door = indexAt({ level: "scene", scene: "door" });
const line = (event: string, payload?: unknown, t = 1) => ({ event, detail: describePayload(payload), t });
const sorted = (list: string[]) => [...list].sort();

describe("live feedback: an event lights its wires (#334, Tilman 2026-11-21)", () => {
  it("lights the wires into and out of the event's box, the plugin's hears and the stub that carries it", () => {
    const hit = liveHit(door, line("openDoor"));
    expect(sorted(hit.wires)).toEqual([">stub:2", "event:openDoor:out>plugin:narrative:hears", "rule:door/#1:do:1>event:openDoor:in"]);
    expect(hit.boxes).toEqual(["event:openDoor"]);
  });

  it("lights a plugin's emits wire when its event fires", () => {
    expect(liveHit(door, line("doorOpened")).wires).toEqual(["plugin:narrative:emits>event:doorOpened:in"]);
  });

  it("lights nothing for an event the level does not draw, and never a node's own event box by name", () => {
    expect(liveHit(door, line("targetLost", "door"))).toEqual({ wires: [], boxes: [], values: {} });
    // `found` is the door's own hook here (event:door/:found), not a bus event
    expect(liveHit(door, line("found"))).toEqual({ wires: [], boxes: [], values: {} });
  });

  it("lights a bundled wire between scenes and a stub by the names they carry (the group and experience levels)", () => {
    const group = indexAt({ level: "group", group: "ch1" });
    expect(liveHit(group, line("keyRattled")).wires).toEqual(["scene:cover:emits>scene:door:hears"]);
    expect(sorted(liveHit(group, line("openDoor")).wires)).toEqual([">stub:1", ">stub:2"]);
    const experience = indexAt({ level: "experience" });
    expect(liveHit(experience, line("sceneChanged", { sceneId: "epilogue" }))).toMatchObject({
      wires: ["event:sceneChanged:out>scene:epilogue:hears"], boxes: ["event:sceneChanged"],
    });
  });

  it("keeps the wires of a folded group: they end on its pill", () => {
    const index = indexAt({ level: "scene", scene: "door" }, { groups: [{ id: "g", label: "g", members: ["rule:bell/#0", "event:keyRattled"], folded: true }] });
    // keyRattled's own wire lies inside the pill; the stub into its box now ends on the pill, the box itself is not drawn
    expect(liveHit(index, line("keyRattled"))).toEqual({ wires: ["stub:1>"], boxes: [], values: {} });
  });
});

describe("live feedback: a variable's change lights its wires and shows its value", () => {
  it("lights the sets into and the reads out of the variable, and gives its box the new value", () => {
    expect(liveHit(door, line("varChanged", { name: "hasKey", scope: "experience", value: true, previous: undefined }))).toEqual({
      wires: ["var:hasKey:get>rule:door/#1:when", "stub:0>"], boxes: ["var:hasKey"], values: { "var:hasKey": "true" },
    });
    expect(liveHit(door, line("varChanged", { name: "rung", scope: "scene", value: true })).wires).toEqual(["rule:bell/#0:do:0>var:rung:set"]);
  });

  it("pulses a variable a plugin sets (a display row, no wire)", () => {
    expect(liveHit(door, line("varChanged", { name: "doorOpen", value: "wide · open" }))).toEqual({
      wires: [], boxes: ["var:doorOpen"], values: { "var:doorOpen": "\"wide · open\"" },
    });
  });

  it("lights a bundled variable wire at the group level", () => {
    expect(sorted(liveHit(indexAt({ level: "group", group: "ch1" }), line("varChanged", { name: "hasKey", value: 1 })).wires))
      .toEqual([">stub:0", "scene:cover:sets>scene:door:reads"]);
  });
});

describe("live feedback: a rule that ran pulses its box and lights its wires", () => {
  it("a node's rule: its box, the wire into its on (its own event) and every wire out of its actions", () => {
    const hit = liveHit(door, line("behaviour", { targetId: "door", rule: 2, on: "found", do: "hide hint, emit openDoor" }));
    expect(sorted(hit.wires)).toEqual(["event:door/:found:out>rule:door/#1:on", "rule:door/#1:do:0>node:door/1:act:hide", "rule:door/#1:do:1>event:openDoor:in"]);
    expect(hit.boxes).toEqual(["rule:door/#1"]);
  });

  it("matches a node's rule by its node's name", () => {
    const view = project(content, { level: "scene", scene: "door" });
    const index = liveIndex(view, flowOf(view), { nodeName: target => (target === "bell" ? "bell" : "") });
    expect(liveHit(index, line("behaviour", { targetId: "bell", node: "bell", rule: 1, on: "keyRattled", do: "…" })).boxes).toEqual(["rule:bell/#0"]);
    expect(liveHit(index, line("behaviour", { targetId: "bell", rule: 1, on: "keyRattled", do: "…" })).boxes).toEqual([]);
  });

  it("names a node from the draft", () => {
    expect(nodeNames(content, "door").nodeName!("door", [1])).toBe("hint");
    expect(nodeNames(content).nodeName!("door", [])).toBeUndefined();
  });

  it("a scene's rule pulses its scene's box at the experience level", () => {
    expect(liveHit(indexAt({ level: "experience" }), line("behaviour", { home: "scene", scene: "door", rule: 1, on: "found", do: "…" })).boxes).toEqual(["scene:door"]);
  });
});

describe("live feedback: only new lines count", () => {
  const lines = [line("c", undefined, 30), line("b", undefined, 20), line("a", undefined, 10)];

  it("marks the timeline as it stands as seen – opening the panel replays nothing", () => {
    expect(freshLines(lines, markSeen(lines))).toEqual({ fresh: [], seen: 30 });
  });

  it("gives the lines after the mark, oldest first, and moves the mark", () => {
    expect(freshLines([line("e", undefined, 50), line("d", undefined, 40), ...lines], 30)).toEqual({ fresh: [line("d", undefined, 40), line("e", undefined, 50)], seen: 50 });
  });

  it("starts again after the timeline was emptied, and only moves the mark when the clock went back", () => {
    expect(freshLines([], 30)).toEqual({ fresh: [], seen: -Infinity });
    expect(freshLines(lines, -Infinity).fresh.map(l => l.event)).toEqual(["a", "b", "c"]);
    expect(freshLines([line("x", undefined, 5)], 30)).toEqual({ fresh: [], seen: 5 });
  });
});

describe("live feedback: the pulses", () => {
  it("restarts a pulse with a new number and drops it when it ended", () => {
    const hit = { wires: ["w"], boxes: ["var:x"], values: { "var:x": "3" } };
    const one = addHit(emptyLive(), hit, 0, 1);
    expect(one.wires.get("w")).toEqual({ n: 1, until: LIVE_MS });
    expect(one.boxes.get("var:x")).toEqual({ n: 1, until: LIVE_MS, value: "3" });
    const two = addHit(one, hit, 500, 2);
    expect(two.wires.get("w")).toEqual({ n: 2, until: 500 + LIVE_MS });
    expect(prune(two, 500 + LIVE_MS).wires.size).toBe(0);
  });
});

describe("a payload line back as fields", () => {
  it("reads describePayload's fields, a text with the separator in it and a missing value", () => {
    expect(parseDetail(describePayload({ name: "a", value: "x · y", previous: undefined, n: 2 }))).toEqual({ name: "a", value: "x · y", previous: undefined, n: 2 });
    expect(parseDetail("door")).toEqual({});
    expect(valueWords("a long text value here")).toBe("\"a long text …");
    expect(valueWords(undefined)).toBe("–");
  });
});
