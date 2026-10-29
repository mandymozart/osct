import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Group } from "three";
import { ComponentSpec, EntityData, Spread, Target } from "../../types/index";
import { buildEntity } from "../entities";
import { installedPlugins, installPlugin, PluginApi, uninstallPlugin } from "../plugins";
import {
  allVars, CORE_EVENTS, emitCoreEvent, observeEvents, PluginRuntimeError, ProgressReader, resetVars, runtimeApi, setProgressReader,
  setSpreadSource, spreadChanged, stageEnded, VarValue,
} from "../plugin-runtime";

/** Plugin API 1.1: events, variables in scopes, the reader's progress and the current spread – what crosses nodes and pages */

const target = (id: string, entity?: EntityData): Target => ({ id, entryId: id, spreadId: "a", imageSrc: `/${id}.jpg`, entity });
const SPREADS: Spread[] = [
  { id: "a", title: "A", firstPage: 1, lastPage: 2, entries: [], targets: [target("key"), target("tally")] },
  { id: "b", title: "B", firstPage: 3, lastPage: 4, format: "spread", entries: [], targets: [target("door")] },
];
const NOTHING: ComponentSpec = { description: "x", params: {} };

const apiOf = (id: string): PluginApi => {
  let seen: PluginApi | null = null;
  installPlugin(id, { register: api => { seen = api; } });
  return seen!;
};

beforeEach(() => {
  setSpreadSource(id => SPREADS.find(s => s.id === id), () => SPREADS);
  setProgressReader(undefined);
});

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  stageEnded();
  resetVars();
  vi.restoreAllMocks();
});

describe("api.events", () => {
  it("delivers a scene event to every plugin on the stage; a core event is the engine's to emit", () => {
    const a = apiOf("a");
    const b = apiOf("b");
    const heard: unknown[] = [];
    b.events.on("doorOpened", payload => heard.push(payload));
    a.events.emit("doorOpened", { by: "key" });
    expect(heard).toEqual([{ by: "key" }]);
    expect(() => a.events.emit("targetFound", { targetId: "x" })).toThrow(PluginRuntimeError);
    expect(() => a.events.emit("Door Opened")).toThrow(/not an event name/);
    expect(CORE_EVENTS).toContain("spreadChanged");
  });

  it("hears the core events the scene emits, typed by name", () => {
    const api = apiOf("fx");
    const found: string[] = [];
    api.events.on("targetFound", ({ targetId }) => found.push(targetId));
    emitCoreEvent("targetFound", { targetId: "key" });
    expect(found).toEqual(["key"]);
  });

  it("a listener that throws is logged and the others still hear the event; the unsubscribe stops it", () => {
    const api = apiOf("fx");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const heard: string[] = [];
    api.events.on("ping", () => { throw new Error("boom"); });
    const off = api.events.on("ping", () => heard.push("second"));
    api.events.emit("ping");
    expect(heard).toEqual(["second"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('fx: the listener for "ping" failed'), expect.any(Error));
    off();
    api.events.emit("ping");
    expect(heard).toEqual(["second"]);
  });

  it("a plugin's listeners go when it is installed again or uninstalled", () => {
    const heard: string[] = [];
    installPlugin("fx", { register: api => api.events.on("ping", () => heard.push("first run")) });
    installPlugin("fx", { register: api => api.events.on("ping", () => heard.push("second run")) });
    const other = apiOf("other");
    other.events.emit("ping");
    expect(heard).toEqual(["second run"]);
    uninstallPlugin("fx");
    other.events.emit("ping");
    expect(heard).toEqual(["second run"]);
  });

  it("an observer (the editor's log) sees every event without being a plugin", () => {
    const seen: string[] = [];
    const stop = observeEvents(event => seen.push(event));
    apiOf("fx").events.emit("ping");
    emitCoreEvent("sceneState", { state: "running" });
    stop();
    emitCoreEvent("sceneState", { state: "paused" });
    expect(seen).toEqual(["ping", "sceneState"]);
  });
});

describe("api.vars", () => {
  it("sets in the spread scope by default, reads outward with the innermost definition winning", () => {
    const api = apiOf("fx");
    api.vars.set("doorOpen", true);
    api.vars.set("hasKey", true, "book");
    api.vars.set("hasKey", false, "stage");
    expect(api.vars.get("doorOpen")).toBe(true);
    expect(api.vars.get("doorOpen", "spread")).toBe(true);
    expect(api.vars.get("doorOpen", "book")).toBeUndefined();
    expect(api.vars.get("hasKey")).toBe(false);
    expect(api.vars.get("hasKey", "book")).toBe(true);
    expect(api.vars.all("stage")).toEqual({ hasKey: false });
    expect(allVars()).toEqual([
      { scope: "spread", name: "doorOpen", value: true },
      { scope: "stage", name: "hasKey", value: false },
      { scope: "book", name: "hasKey", value: true },
    ]);
  });

  it("the spread scope ends with the spread, the stage scope with the scene, session and book stay", () => {
    const api = apiOf("fx");
    api.vars.set("s", 1, "spread");
    api.vars.set("st", 2, "stage");
    api.vars.set("se", 3, "session");
    api.vars.set("b", 4, "book");
    spreadChanged("b");
    expect(api.vars.get("s")).toBeUndefined();
    expect(api.vars.get("st")).toBe(2);
    stageEnded();
    expect(api.vars.get("st")).toBeUndefined();
    expect(api.vars.get("se")).toBe(3);
    expect(api.vars.get("b")).toBe(4);
  });

  it("every change is a varChanged event; vars.on filters by name; null deletes; a write of the same value is silent", () => {
    const api = apiOf("fx");
    const changes: unknown[] = [];
    const named: unknown[] = [];
    api.events.on("varChanged", change => changes.push(change));
    api.vars.on("hasKey", (value, previous, scope) => named.push([value, previous, scope]));
    api.vars.set("hasKey", true, "book");
    api.vars.set("hasKey", true, "book");
    api.vars.set("other", 1);
    api.vars.set("hasKey", null, "book");
    expect(changes).toEqual([
      { name: "hasKey", scope: "book", value: true, previous: undefined },
      { name: "other", scope: "spread", value: 1, previous: undefined },
      { name: "hasKey", scope: "book", value: undefined, previous: true },
    ]);
    expect(named).toEqual([[true, undefined, "book"], [undefined, true, "book"]]);
    expect(api.vars.all("book")).toEqual({});
  });

  it("refuses a bad name, scope or value", () => {
    const api = apiOf("fx");
    expect(() => api.vars.set("Has Key", true)).toThrow(/not a variable name/);
    expect(() => api.vars.set("x", true, "galaxy" as never)).toThrow(/scope/);
    expect(() => api.vars.set("x", { a: 1 } as unknown as VarValue)).toThrow(/string, a number or a boolean/);
    expect(() => api.events.on("ping", "nope" as never)).toThrow(/needs a listener/);
  });

  it("the book scope goes through the app's progress when it offers variables", () => {
    const stored = new Map<string, VarValue>([["hasKey", true]]);
    const reader: ProgressReader = {
      variables: {
        get: name => stored.get(name),
        set: (name, value) => { if (value === null) stored.delete(name); else stored.set(name, value); },
        all: () => Object.fromEntries(stored),
      },
    };
    setProgressReader(reader);
    const api = apiOf("fx");
    expect(api.vars.get("hasKey")).toBe(true);
    api.vars.set("chapter", 2, "book");
    expect(stored.get("chapter")).toBe(2);
    expect(api.vars.all("book")).toEqual({ hasKey: true, chapter: 2 });
    resetVars();
    expect(stored.size).toBe(0);
  });
});

describe("api.progress and api.spread", () => {
  it("reads the app's progress: unlocked, consulted, counts and completion per spread or for the book", () => {
    setProgressReader({ unlocked: id => id === "key", consulted: id => id === "key" });
    const api = apiOf("fx");
    expect(api.progress.unlocked("key")).toBe(true);
    expect(api.progress.unlocked("door")).toBe(false);
    expect(api.progress.consulted("key")).toBe(true);
    expect(api.progress.counts("a")).toEqual({ unlocked: 1, targets: 2 });
    expect(api.progress.counts()).toEqual({ unlocked: 1, targets: 3 });
    expect(api.progress.completion("a")).toBe(0.5);
    expect(api.progress.completion("nowhere")).toBe(1);
    expect(api.progress.completion()).toBeCloseTo(1 / 3);
  });

  it("without a progress reader nothing is unlocked", () => {
    const api = apiOf("fx");
    expect(api.progress.unlocked("key")).toBe(false);
    expect(api.progress.completion()).toBe(0);
  });

  it("knows the current spread after the scene changed it", () => {
    const api = apiOf("fx");
    expect(api.spread.current).toBeNull();
    const seen: unknown[] = [];
    api.events.on("spreadChanged", change => seen.push(change));
    spreadChanged("a");
    expect(api.spread.current?.id).toBe("a");
    expect(api.spread.current?.targets.map(t => t.id)).toEqual(["key", "tally"]);
    spreadChanged("b");
    expect(seen).toEqual([{ spreadId: "a", previous: null }, { spreadId: "b", previous: "a" }]);
    expect(api.spread.get("a")?.title).toBe("A");
    stageEnded();
    expect(api.spread.current).toBeNull();
  });
});

describe("a component's context and hooks (1.1)", () => {
  it("gets the children's placement groups and is told about the first find", () => {
    const calls: string[] = [];
    let children: unknown[] = [];
    installPlugin("fx", {
      register: api => api.registerComponent("door", NOTHING, ctx => {
        children = ctx.children;
        return { onUnlocked: () => calls.push("unlocked"), onFound: () => calls.push("found") };
      }),
    });
    const entity: EntityData = {
      type: "group", assets: [], components: [{ type: "door" }],
      children: [{ type: "text", assets: [], text: "door" }, { type: "text", assets: [], text: "hint" }],
    };
    const instance = buildEntity(target("door", entity), () => undefined)!;
    expect(children).toHaveLength(2);
    expect(children[0]).toBeInstanceOf(Group);
    expect(children[0]).toBe(instance.nodes!["0"]);
    expect(children[1]).toBe(instance.nodes!["1"]);
    instance.onFound!();
    instance.onUnlocked!();
    expect(calls).toEqual(["found", "unlocked"]);
  });
});
