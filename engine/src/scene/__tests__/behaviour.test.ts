import { afterEach, describe, expect, it, vi } from "vitest";
import { Group } from "three";
import { BEHAVIOUR_CORE_EVENTS, BEHAVIOUR_SCOPES, type EntityData, type NodeTimeline, type Target } from "../../types/index";
import { applyBehaviour, MAX_DEPTH, namedPaths, passes } from "../behaviour";
import { buildEntity } from "../entities";
import { installedPlugins, installPlugin, type PluginApi, uninstallPlugin } from "../plugins";
import { CORE_EVENTS, observeEvents, resetVars, runtimeApi, stageEnded, VAR_SCOPES } from "../plugin-runtime";

/** The built-in behaviour component: rules on the node's events and the bus, conditions on variables, actions */

const target = (id: string, entity?: EntityData): Target => ({ id, entryId: id, spreadId: "a", imageSrc: `/${id}.jpg`, entity });
const group = (extra: Partial<EntityData> = {}): EntityData => ({ type: "group", assets: [], ...extra });
const behaviour = (rules: unknown[]) => ({ type: "behaviour", rules });

/** A timeline that records what was asked of it */
const fakeTimeline = (clips = ["rattle", "spin"]) => {
  const calls: string[] = [];
  const timeline: NodeTimeline = {
    clips: clips.map(name => ({ name, duration: 1 })),
    state: () => ({ clip: "", time: 0, playing: false, duration: 1 }),
    play: clip => calls.push(`play ${clip ?? "-"}`),
    pause: () => calls.push("pause"),
    seek: time => calls.push(`seek ${time}`),
  };
  return { timeline, calls };
};

const vars = () => runtimeApi("test").vars;
const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach(off => off());
  installedPlugins().forEach(uninstallPlugin);
  stageEnded();
  resetVars();
  vi.restoreAllMocks();
});

describe("behaviour: conditions", () => {
  it("passes without a condition, with every test equal (all) or one (any); not turns a test round; null is a variable not set", () => {
    const v = vars();
    v.set("hasKey", true, "book");
    v.set("tries", 2, "stage");
    expect(passes(null, v)).toBe(true);
    expect(passes({ match: "all", tests: [{ name: "hasKey", value: true, not: false }, { name: "tries", value: 2, not: false }] }, v)).toBe(true);
    expect(passes({ match: "all", tests: [{ name: "hasKey", value: true, not: false }, { name: "tries", value: 3, not: false }] }, v)).toBe(false);
    expect(passes({ match: "any", tests: [{ name: "hasKey", value: false, not: false }, { name: "tries", value: 2, not: false }] }, v)).toBe(true);
    expect(passes({ match: "all", tests: [{ name: "hasKey", value: true, not: true }] }, v)).toBe(false);
    expect(passes({ match: "all", tests: [{ name: "doorOpen", value: null, not: false }] }, v)).toBe(true);
    expect(passes({ match: "all", tests: [{ name: "doorOpen", value: true, not: true }] }, v)).toBe(true);
  });

  it("reads the innermost scope that has the variable, like api.vars.get", () => {
    const v = vars();
    v.set("mood", "calm", "book");
    v.set("mood", "angry", "spread");
    expect(passes({ match: "all", tests: [{ name: "mood", value: "angry", not: false }] }, v)).toBe(true);
  });
});

describe("behaviour: events and actions", () => {
  it("a tap plays a clip, sets a variable in its scope and emits a scene event to the bus", () => {
    const { timeline, calls } = fakeTimeline();
    const node = group({ components: [behaviour([{ on: "tap", do: [{ play: "rattle" }, { set: { hasKey: true }, scope: "book" }, { emit: "keyRattled" }] }])] });
    const heard: unknown[] = [];
    let plugin: PluginApi | null = null;
    installPlugin("listener", { register: api => { plugin = api; api.events.on("keyRattled", payload => heard.push(payload)); } });
    const instance = applyBehaviour({ node, target: target("key"), nodes: { "": new Group() }, timelines: { "": timeline } })!;
    cleanups.push(instance.dispose);

    instance.onTap();
    expect(calls).toEqual(["play rattle"]);
    expect(plugin!.vars.get("hasKey", "book")).toBe(true);
    expect(heard).toEqual([{ targetId: "key" }]);
    // found has no rule: nothing happens
    instance.onFound();
    expect(calls).toEqual(["play rattle"]);
  });

  it("checks the conditions of every rule of an event first, then runs the matching ones in order (a toggle in two rules)", () => {
    const node = group({ components: [behaviour([
      { on: "tap", when: { open: { not: true } }, do: { set: { open: true } } },
      { on: "tap", when: { open: true }, do: { set: { open: false } } },
    ])] });
    const instance = applyBehaviour({ node, target: target("box"), nodes: { "": new Group() }, timelines: {} })!;
    cleanups.push(instance.dispose);
    const v = vars();
    instance.onTap();
    expect(v.get("open")).toBe(true);
    instance.onTap();
    expect(v.get("open")).toBe(false);
    instance.onTap();
    expect(v.get("open")).toBe(true);
  });

  it("found shows and hides nodes of its subtree by name; the own node when no name is given", () => {
    const hint = new Group();
    const own = new Group();
    const node = group({
      children: [group({ name: "door" }), group({ name: "hint" })],
      components: [behaviour([
        { on: "found", do: { show: "hint" } },
        { on: "found", when: { hasKey: true }, do: [{ hide: "hint" }, { emit: "openDoor" }] },
        { on: "lost", do: "hide" },
      ])],
    });
    const instance = applyBehaviour({ node, target: target("door"), nodes: { "": own, "0": new Group(), "1": hint }, timelines: {} })!;
    cleanups.push(instance.dispose);
    const opened: unknown[] = [];
    cleanups.push(runtimeApi("door-plugin").events.on("openDoor", payload => opened.push(payload)));

    hint.visible = false;
    instance.onFound();
    expect(hint.visible).toBe(true);
    expect(opened).toEqual([]);
    vars().set("hasKey", true, "book");
    instance.onFound();
    expect(hint.visible).toBe(false);
    expect(opened).toEqual([{ targetId: "door" }]);
    instance.onLost();
    expect(own.visible).toBe(false);
  });

  it("pause and stop act on a named model's timeline; stop goes back to the start", () => {
    const { timeline, calls } = fakeTimeline();
    const node = group({
      children: [{ type: "model", name: "door", assets: [] }],
      components: [behaviour([{ on: "tap", do: [{ play: "spin", node: "door" }, { pause: "door" }, { stop: "door" }] }])],
    });
    const instance = applyBehaviour({ node, target: target("t"), nodes: { "": new Group(), "0": new Group() }, timelines: { "0": timeline } })!;
    cleanups.push(instance.dispose);
    instance.onTap();
    expect(calls).toEqual(["play spin", "pause", "seek 0", "pause"]);
  });

  it("hears named events of the bus, and unlocked from the node's first find", () => {
    const node = group({ components: [behaviour([
      { on: "doorOpened", do: { set: { lampOn: true }, scope: "stage" } },
      { on: "unlocked", do: { set: { firstFind: true } } },
    ])] });
    const instance = applyBehaviour({ node, target: target("lamp"), nodes: { "": new Group() }, timelines: {} })!;
    runtimeApi("narrative").events.emit("doorOpened", { by: "key" });
    expect(vars().get("lampOn", "stage")).toBe(true);
    instance.onUnlocked();
    expect(vars().get("firstFind", "spread")).toBe(true);
    // disposed: the bus no longer reaches it
    instance.dispose();
    resetVars();
    runtimeApi("narrative").events.emit("doorOpened");
    expect(vars().get("lampOn")).toBeUndefined();
  });

  it("logs an action it cannot run and runs the next one: a missing node, a missing clip, no timeline", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { timeline, calls } = fakeTimeline(["rattle"]);
    const node = group({ components: [behaviour([{ on: "tap", do: [{ show: "nowhere" }, { play: "dance" }, { pause: "" }, { set: { done: true } }] }])] });
    const instance = applyBehaviour({ node, target: target("t"), nodes: { "": new Group() }, timelines: { "": timeline } })!;
    cleanups.push(instance.dispose);
    instance.onTap();
    expect(calls).toEqual(["pause"]);
    expect(vars().get("done")).toBe(true);
    expect(warn.mock.calls.map(c => String(c[0]))).toEqual([
      expect.stringContaining('no node named "nowhere"'),
      expect.stringContaining('no clip "dance"'),
    ]);
  });

  it("cuts off rules that set each other off through events", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const node = group({ components: [behaviour([{ on: "ping", do: { emit: "ping" } }])] });
    const instance = applyBehaviour({ node, target: target("loop"), nodes: { "": new Group() }, timelines: {} })!;
    cleanups.push(instance.dispose);
    let count = 0;
    cleanups.push(runtimeApi("counter").events.on("ping", () => count++));
    runtimeApi("starter").events.emit("ping");
    expect(count).toBe(MAX_DEPTH + 1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("more than 8 events deep"));
  });

  it("tells the editor's log which rule fired and what it did – not the bus", () => {
    const node = group({ name: "key", components: [behaviour([{ on: "tap", do: [{ play: "rattle" }, { set: { hasKey: true }, scope: "book" }] }])] });
    const log: Array<[string, unknown]> = [];
    cleanups.push(observeEvents((event, payload) => log.push([event, payload])));
    const instance = applyBehaviour({ node, target: target("key"), nodes: { "": new Group() }, timelines: { "": fakeTimeline().timeline } })!;
    cleanups.push(instance.dispose);
    instance.onTap();
    expect(log[0]).toEqual(["behaviour", { targetId: "key", node: "key", rule: 1, on: "tap", do: "play rattle · set hasKey = true (book)" }]);
    expect(log[1][0]).toBe("varChanged");
  });

  it("takes new rules in place (the editor's live edit)", () => {
    const node = group({ components: [behaviour([{ on: "tap", do: { set: { a: 1 } } }])] });
    const instance = applyBehaviour({ node, target: target("t"), nodes: { "": new Group() }, timelines: {} })!;
    cleanups.push(instance.dispose);
    expect(instance.tune(group({ components: [behaviour([{ on: "tap", do: { set: { a: 2 } } }])] }))).toBe(true);
    instance.onTap();
    expect(vars().get("a")).toBe(2);
    expect(instance.tune(group())).toBe(false);
  });
});

describe("behaviour: in the entity's node tree", () => {
  it("buildEntity joins the behaviour to the node's hooks and names its subtree's nodes", () => {
    const tree = group({
      components: [behaviour([{ on: "found", do: { hide: "hint" } }, { on: "tap", do: { show: "hint" } }])],
      children: [group({ name: "door" }), group({ name: "hint" })],
    });
    const entity = buildEntity(target("door", tree), () => undefined)!;
    const hint = entity.nodes!["1"];
    entity.onFound!();
    expect(hint.visible).toBe(false);
    entity.onTap!();
    expect(hint.visible).toBe(true);
    // the same tree with other rules tunes in place; without the behaviour it is built anew
    expect(entity.tune!({ ...tree, components: [behaviour([{ on: "found", do: { show: "hint" } }])] })).toBe(true);
    expect(entity.tune!({ ...tree, components: [] })).toBe(false);
    entity.dispose!();
  });

  it("finds the first node of a name, its own name included", () => {
    expect(namedPaths(group({ name: "root", children: [group({ name: "a", children: [group({ name: "b" })] }), group({ name: "b" })] })))
      .toEqual(new Map([["root", ""], ["a", "0"], ["b", "0.0"]]));
  });

  it("the shared grammar names the runtime's scopes and core events", () => {
    expect([...BEHAVIOUR_SCOPES]).toEqual([...VAR_SCOPES]);
    expect([...BEHAVIOUR_CORE_EVENTS].sort()).toEqual([...CORE_EVENTS].sort());
  });
});
