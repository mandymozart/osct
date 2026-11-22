import { describe, expect, it } from "vitest";
import type { EntityData, PluginData } from "@engine/types";
import { apply, typedRefusal } from "../apply";
import { flowOf } from "../flow";
import { pluginCodeUses } from "../plugin-code";
import { pluginUses, project, type LogicContent } from "../project";
import { nodePorts, typeTakes } from "../spec-ports";
import type { Context, GraphNode, View } from "../types";

// Ports from the specs (#334 L-T6, research §5.9): one target whose tree holds a video, an image, a text and a model with a
// plugin's component (hum: a volume, the verbs play / pause, the event ended). The root's rules show the caption and play the
// model on found; a scene rule listens to hummed.
const tree: EntityData = {
  type: "group", assets: [],
  children: [
    { type: "video", name: "clip", assets: [{ id: "v", assetType: "video", src: "/clip.mp4" }] },
    { type: "image", name: "pic", assets: [{ id: "i", assetType: "image", src: "/pic.webp" }] },
    { type: "text", name: "caption", assets: [], text: "Hello" },
    { type: "model", name: "box", assets: [], components: [{ type: "hum", volume: 0.4 }] },
  ],
  components: [{ type: "behaviour", rules: [{ on: "found", do: [{ show: "caption" }, { play: "", node: "box" }] }] }],
} as unknown as EntityData;

const hum = {
  description: "Hums.", params: { volume: { kind: "number", default: 0.6, min: 0, max: 1, description: "How loud." } },
  actions: ["play", "pause"], events: ["ended"], uses: { listens: ["doorOpened"], sets: ["hummed"] },
};
const plugins = [{ id: "audio", src: "/a.js", api: "4.0", registered: { components: { hum } } }] as unknown as PluginData[];

const base: LogicContent = {
  scenes: [{ id: "s", label: "Studio", targets: [{ id: "t", entity: tree }], rules: [{ on: "ended", when: null, do: [] }] }],
  plugins,
  // The regex reading says something else: the declaration wins
  code: { audio: pluginCodeUses(`api.events.on("other", f); api.vars.set("legacy", 1);`) },
  variables: { mood: { type: "string", default: "calm" }, count: { type: "integer", default: 1 }, level: { type: "number", default: 0.5 } },
} as unknown as LogicContent;

const entity: Context = { level: "entity", scene: "s", target: "t", path: [] };
const scene: Context = { level: "scene", scene: "s" };
const box = (view: View, id: string): GraphNode => view.nodes.find(n => n.id === id)!;
const shown = (node: GraphNode) => node.ports.filter(p => p.kind && !p.hidden).map(p => p.id);
const all = (node: GraphNode) => node.ports.filter(p => p.kind).map(p => p.id);

describe("ports from the specs", () => {
  it("the built-in node types have specs: a video's file, a text's line and colour, a model's verbs", () => {
    const [video, image, text, model] = tree.children!;
    expect(nodePorts(video, [])).toEqual([
      { id: "src", label: "file", signal: "media", dir: "in", kind: "src", type: { kind: "file", accepts: "video" }, owner: "video" },
      { id: "act:show", label: "show", signal: "node", dir: "in", kind: "action", owner: "video" },
      { id: "act:hide", label: "hide", signal: "node", dir: "in", kind: "action", owner: "video" },
    ]);
    expect(nodePorts(image, []).map(p => p.id)).toEqual(["src", "act:show", "act:hide"]);
    expect(nodePorts(text, []).map(p => [p.id, p.type?.kind ?? p.kind])).toEqual([["p:text", "string"], ["p:color", "color"], ["act:show", "action"], ["act:hide", "action"]]);
    // A plugin's component: its parameter (prefixed by its type), its verbs once each, its event outlet
    expect(nodePorts(model, plugins).map(p => p.id)).toEqual(["src", "act:play", "act:pause", "act:stop", "act:show", "act:hide", "p:hum.volume", "ev:ended"]);
    expect(nodePorts(model, plugins).find(p => p.id === "p:hum.volume")).toMatchObject({ signal: "value", type: { kind: "number", min: 0, max: 1 }, owner: "hum" });
  });

  it("the entity level draws every node of the tree with its ports – the wired ones shown, the rest hidden", () => {
    const view = project(base, entity);
    expect(view.nodes.filter(n => n.kind === "node").map(n => n.id)).toEqual(["node:t/2", "node:t/3", "node:t/0", "node:t/1"]);
    // The rule's show lands on the caption's show inlet, its play on the model's play inlet
    expect(view.edges.filter(e => e.from[0] === "rule:t/#0").map(e => e.to)).toEqual([["node:t/2", "act:show"], ["node:t/3", "act:play"]]);
    expect(shown(box(view, "node:t/2"))).toEqual(["act:show"]);
    // The plugin emits ended (declared): its box draws the event, so the outlet is wired too
    expect(shown(box(view, "node:t/3"))).toEqual(["act:play", "ev:ended"]);
    expect(shown(box(view, "node:t/0"))).toEqual([]);
    expect(all(box(view, "node:t/0"))).toEqual(["src", "act:show", "act:hide"]);
    // An image shows its picture
    expect(box(view, "node:t/1").preview).toBe("/pic.webp");
  });

  it("an event a component declares is wired to the event's box where the level has one (the scene level listens to ended)", () => {
    const view = project(base, scene);
    expect(view.edges.find(e => e.from.join() === "node:t/3,ev:ended")).toMatchObject({ to: ["event:ended", "in"], signal: "event", home: null });
    expect(shown(box(view, "node:t/3"))).toEqual(["act:play", "ev:ended"]);
  });

  it("exposed ports (the level's canvas) show; the flow draws only shown ports and lists the hidden ones for the +", () => {
    const content = { ...base, scenes: [{ ...base.scenes[0], canvas: { exposed: { "node:t/3": ["p:hum.volume"] } } }] };
    const view = project(content, entity);
    expect(shown(box(view, "node:t/3"))).toEqual(["act:play", "p:hum.volume", "ev:ended"]);
    const flow = flowOf(view);
    const model = flow.boxes.find(b => b.id === "node:t/3")!;
    expect(model.ports.filter(p => p.kind).map(p => p.id)).toEqual(["act:play", "p:hum.volume", "ev:ended"]);
    expect(model.hidden.map(p => p.id)).toEqual(["src", "act:pause", "act:stop", "act:show", "act:hide"]);
    expect(model.h).toBeGreaterThan(flow.boxes.find(b => b.id === "node:t/0")!.h);
    expect(model.ports.find(p => p.id === "p:hum.volume")?.detail).toBe("a number 0–1");
  });
});

describe("exposing and hiding ports are canvas ops", () => {
  it("expose writes the level's canvas; hide unused clears one box or every box", () => {
    const exposed = apply({ op: "canvas", edit: { edit: "expose", box: "node:t/0", ports: ["src"] } }, base, entity);
    if (!exposed.ok) throw new Error(exposed.reason);
    expect(exposed.canvas).toEqual([{ doc: "scene", scene: "s", canvas: { exposed: { "node:t/0": ["src"] } } }]);
    expect(shown(box(project(exposed.content, entity), "node:t/0"))).toEqual(["src"]);
    const again = apply({ op: "canvas", edit: { edit: "expose", box: "node:t/0", ports: ["src"] } }, exposed.content, entity);
    expect(again).toEqual({ ok: false, reason: "clip shows that port already." });
    expect(apply({ op: "canvas", edit: { edit: "expose", box: "node:t/0", ports: ["p:nope"] } }, base, entity)).toEqual({ ok: false, reason: "clip has no port p:nope." });
    const hidden = apply({ op: "canvas", edit: { edit: "hideUnused" } }, exposed.content, entity);
    if (!hidden.ok) throw new Error(hidden.reason);
    expect(hidden.canvas).toEqual([{ doc: "scene", scene: "s", canvas: undefined }]);
    expect(hidden.words).toBe("One box shows only their wired ports again.");
    expect(apply({ op: "canvas", edit: { edit: "hideUnused" } }, base, entity)).toEqual({ ok: false, reason: "Every box here shows only its wired ports already." });
    expect(apply({ op: "canvas", edit: { edit: "hideUnused" } }, base, { level: "group", group: "g" })).toMatchObject({ ok: false });
  });
});

describe("connecting is strictly typed (B8) and lands in a document field (L1)", () => {
  const exposedAll = (): LogicContent => {
    const view = project(base, entity);
    const exposed = Object.fromEntries(view.nodes.filter(n => n.ports.some(p => p.kind)).map(n => [n.id, n.ports.filter(p => p.kind).map(p => p.id)]));
    return { ...base, scenes: [{ ...base.scenes[0], canvas: { exposed } }] } as LogicContent;
  };
  const content = exposedAll();
  const connect = (from: [string, string], to: [string, string]) => apply({ op: "connect", from, to }, content, entity);

  it("a rule's do into an action inlet writes that verb on the node", () => {
    const result = connect(["rule:t/#0", "do"], ["node:t/0", "act:hide"]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.words).toMatch(/now also does: hide clip.$/);
    const rules = (result.changed[0].entity.components![0] as unknown as { rules: Array<Record<string, unknown>> }).rules;
    expect(rules[0].do).toEqual([{ show: "caption" }, { play: "", node: "box" }, { hide: "clip" }]);
    // Re-aiming an action into another verb's inlet changes its verb
    const reaimed = connect(["rule:t/#0", "do:0"], ["node:t/3", "act:pause"]);
    if (!reaimed.ok) throw new Error(reaimed.reason);
    expect(reaimed.words).toMatch(/show caption → pause box\.$/);
  });

  it("a value inlet takes only its type, an integer where a number goes – and no rule sets a parameter yet", () => {
    const vars = project(content, entity);
    // The variables are no boxes here until a rule reads them: the check itself is pure
    const variable = (name: string): GraphNode => ({ id: `var:${name}`, kind: "variable", label: name, detail: "", ports: [{ id: "get", label: "get", signal: "value", dir: "out" }], pick: null });
    const model = box(vars, "node:t/3");
    const typeOf = (name: string) => base.variables?.[name]?.type;
    expect(typedRefusal({ node: variable("mood"), port: "get" }, { node: model, port: "p:hum.volume" }, typeOf)).toBe("volume takes a number 0–1, not a text (mood).");
    expect(typedRefusal({ node: variable("count"), port: "get" }, { node: model, port: "p:hum.volume" }, typeOf)).toBe("volume takes a number 0–1 – no rule action sets a component's parameter yet; set it in the Inspector.");
    expect(typedRefusal({ node: variable("mood"), port: "get" }, { node: model, port: "act:play" }, typeOf)).toBe("play takes a rule's action, not a text (mood).");
    expect(typeTakes({ kind: "number", min: 0, max: 1 }, { kind: "integer", min: 0, max: 4 })).toBe(true);
    expect(typeTakes({ kind: "integer", min: 0, max: 4 }, { kind: "number", min: 0, max: 1 })).toBe(false);
    expect(typeTakes({ kind: "string" }, { kind: "boolean" })).toBe(false);
  });

  it("a rule's do into a parameter or a file inlet is refused with the reason", () => {
    expect(connect(["rule:t/#0", "do"], ["node:t/3", "p:hum.volume"])).toEqual({ ok: false, reason: "volume takes a number 0–1, not a rule's action." });
    expect(connect(["rule:t/#0", "do"], ["node:t/0", "src"])).toEqual({ ok: false, reason: "clip's file takes a video file, not a rule's action – files on the canvas come later; pick the file in the Inspector." });
  });

  it("a node's event outlet into a rule's on makes the rule listen to that event by name", () => {
    const result = connect(["node:t/3", "ev:ended"], ["rule:t/#0", "on"]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.words).toMatch(/now listens to ended \(was found\) – by name, from whatever emits it\.$/);
    expect(connect(["node:t/3", "ev:ended"], ["node:t/0", "act:show"])).toEqual({ ok: false, reason: "show takes a rule's action, not an event (ended)." });
  });
});

describe("a plugin's declared bus use wins over reading its code", () => {
  it("uses its specs' uses and events; the code's regex only for a plugin that declares nothing", () => {
    expect(pluginUses(base).audio).toEqual({ listens: ["doorOpened"], emits: ["ended"], reads: [], sets: ["hummed"] });
    const undeclared = { ...base, plugins: [{ id: "audio", src: "/a.js", api: "4.0", registered: { components: { hum: { description: "", params: {} } } } }] } as unknown as LogicContent;
    expect(pluginUses(undeclared).audio).toEqual({ listens: ["other"], emits: [], reads: [], sets: ["legacy"] });
    const view = project(base, { level: "experience" });
    expect(view.nodes.find(n => n.id === "plugin:audio")?.detail).toBe("plugin · declared");
    expect(view.nodes.some(n => n.id === "var:hummed")).toBe(true);
    expect(view.nodes.some(n => n.id === "var:legacy")).toBe(false);
  });
});
