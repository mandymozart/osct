import {
  BEHAVIOUR_CORE_EVENTS, BEHAVIOUR_TYPE, behaviourRules, isBehaviourNodeEvent,
  type BehaviourCondition, type BehaviourRule, type BehaviourScope, type EntityData, type GroupData, type PluginData,
} from "@engine/types";
import { textVariables } from "@shared/text/expressions";
import { pathOfName } from "#lib/behaviour-edit.js";
import { nodeLabel } from "#lib/tree.js";
import type { PluginUses } from "./plugin-code";
import { coreRegistry, type NodeRegistry } from "./registry";
import type { Context, GraphEdge, GraphNode, Home, LogicPick, Problem, Signal, Stub, View } from "./types";

/**
 * `project(content, context)` → `View` (#334, research §6): the logic of the experience as a graph **for one level**, computed
 * from the draft the editor already holds (the scenes with their targets' entity trees and entries, the groups, the plugins
 * and what their code uses) – nothing is stored, nothing fetched.
 *
 * - **scene** (#239's panel): the events (a node's own `found` / `lost` / `tap` / `unlocked`, a scene event, a core event),
 *   the rules of the scene's `behaviour` components, the variables they read and set, the nodes they act on and the plugins
 *   on its nodes or touching its rules' events and variables. Stubs: a variable set in another scene and read here (or the
 *   reverse), an event emitted in another scene and heard here (or the reverse).
 * - **entity**: the same for one target's tree (`path`: its subtree); stubs also to the scene's other targets.
 * - **group**: its scenes and the derived edges between them (events and variables joined by name); stubs to scenes outside
 *   the group and to plugins.
 * - **experience**: the groups (frames), the scenes in order, the plugins, the variables that cross scenes (set in a scope
 *   wider than `scene`, or by a plugin), the core events the rules hear. An event joins two places (scenes, plugins) by one
 *   derived edge per pair; a variable joins them through its own box (set in A → `hasKey` → read in B). Nothing crosses it.
 *
 * Cross-scene joins follow the bus and the variables' scopes: a variable set with scope `scene` never reaches another scene;
 * a plugin's scope is unknown, so it counts as crossing. Entry texts read variables (`{hasKey}`, `shared/text/expressions.ts`).
 * Whether an event reaches a scene that is not loaded is not decided here (L-T3). `goto` edges come with the MAJOR (L-T5).
 * **Problems** look at the whole experience: a variable read that nothing sets, an event heard that nothing emits, an event
 * emitted that nothing hears, a node an action names that its subtree does not have. While a plugin's code is unknown, only
 * the last is said.
 */

/** A target as the engine maps it (the entity ref resolved) */
export interface LogicTarget {
  id: string;
  entity?: EntityData;
}

/** An entry: its text may read variables */
export interface LogicEntry {
  id: string;
  title: string;
  body?: string;
}

/** A scene as the editor's draft holds it (`content.scenes`, the engine's `Scene`) */
export interface LogicScene {
  id: string;
  label: string;
  group?: string;
  targets: readonly LogicTarget[];
  entries?: readonly LogicEntry[];
}

export interface LogicContent {
  /** The scenes in order */
  scenes: readonly LogicScene[];
  groups?: readonly GroupData[];
  /** The experience's declared plugins with what they recorded (`registered`) */
  plugins?: readonly PluginData[];
  /** What each plugin's code uses, by plugin id; a plugin missing here is unknown */
  code?: Readonly<Record<string, PluginUses>>;
}

export interface ProjectOptions {
  /** The node types (ports by kind); the core's by default */
  registry?: NodeRegistry;
}

const CORE = BEHAVIOUR_CORE_EVENTS as readonly string[];
const BUILT_IN_COMPONENTS = [BEHAVIOUR_TYPE, "animation"];
const EMPTY_CANVAS = () => ({ nodes: [], wires: [] });

const pathKey = (target: string, path: readonly number[]) => `${target}/${path.join(".")}`;
const startsWith = (path: readonly number[], prefix: readonly number[]) => prefix.every((p, i) => path[i] === p);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every node of a tree with its path, depth first */
const walk = (node: EntityData, path: number[] = []): Array<{ node: EntityData; path: number[] }> =>
  [{ node, path }, ...(node.children ?? []).flatMap((child, i) => walk(child, [...path, i]))];

/** A node's rules with where each sits: its component's index and its index there */
const rulesOfNode = (node: EntityData): Array<{ rule: BehaviourRule; component: number; index: number }> =>
  (node.components ?? []).flatMap((c, component) => (c.type === BEHAVIOUR_TYPE ? behaviourRules(c).map((rule, index) => ({ rule, component, index })) : []));

const valueWord = (value: unknown) => (value === null ? "unset" : JSON.stringify(value));

/** A condition in words: `hasKey = true`, `any: a = 1, b ≠ 2` */
export const conditionWords = (when: BehaviourCondition | null): string => {
  if (!when) return "always";
  const tests = when.tests.map(t => `${t.name} ${t.not ? "≠" : "="} ${valueWord(t.value)}`).join(", ");
  return when.match === "any" && when.tests.length > 1 ? `any: ${tests}` : tests;
};

/** The plugin that registered a type (a component, a node type, a material), by what the plugins recorded */
const pluginOfType = (plugins: readonly PluginData[], kind: "components" | "nodeTypes" | "materials", type: string): string | null =>
  plugins.find(p => p.registered?.[kind]?.[type])?.id ?? null;

// ── Places and their uses: who sets, reads, emits and hears what, across the experience ──────────────────────────────

/** Where something is used: a target's tree, a scene's entry texts (`target` null), or a plugin's code */
interface Place {
  key: string;
  scene: string | null;
  target: string | null;
  plugin: string | null;
}

type UseKind = "sets" | "reads" | "emits" | "hears";

interface Use {
  place: Place;
  kind: UseKind;
  name: string;
  /** A rule's `set` scope; null: a plugin's (unknown) */
  scope?: BehaviourScope | null;
}

/** A join by name: a variable set in one place and read in another, an event emitted in one place and heard in another */
interface Join {
  kind: "variable" | "event";
  name: string;
  from: Place;
  to: Place;
}

const targetPlace = (scene: string, target: string): Place => ({ key: `target:${scene}/${target}`, scene, target, plugin: null });
const textPlace = (scene: string): Place => ({ key: `text:${scene}`, scene, target: null, plugin: null });
const pluginPlace = (plugin: string): Place => ({ key: `plugin:${plugin}`, scene: null, target: null, plugin });

const usesOf = (content: LogicContent): Use[] => {
  const uses: Use[] = [];
  for (const scene of content.scenes) {
    for (const target of scene.targets) {
      if (!target.entity) continue;
      const place = targetPlace(scene.id, target.id);
      for (const { node } of walk(target.entity)) {
        for (const { rule } of rulesOfNode(node)) {
          if (!isBehaviourNodeEvent(rule.on)) uses.push({ place, kind: "hears", name: rule.on });
          for (const test of rule.when?.tests ?? []) uses.push({ place, kind: "reads", name: test.name });
          for (const action of rule.do) {
            if (action.action === "set") uses.push({ place, kind: "sets", name: action.name, scope: action.scope });
            if (action.action === "emit") uses.push({ place, kind: "emits", name: action.event });
          }
        }
      }
    }
    const place = textPlace(scene.id);
    for (const entry of scene.entries ?? []) {
      for (const name of entry.body ? textVariables(entry.body) : []) uses.push({ place, kind: "reads", name });
    }
  }
  for (const [plugin, code] of Object.entries(content.code ?? {})) {
    const place = pluginPlace(plugin);
    code.hears.forEach(name => uses.push({ place, kind: "hears", name }));
    code.emits.forEach(name => uses.push({ place, kind: "emits", name }));
    code.reads.forEach(name => uses.push({ place, kind: "reads", name }));
    code.sets.forEach(name => uses.push({ place, kind: "sets", name, scope: null }));
  }
  return uses;
};

/** Every join between two different places; a variable set with scope `scene` joins only within its scene; core events are the engine's */
const joinsOf = (uses: readonly Use[]): Join[] => {
  const joins: Join[] = [];
  const seen = new Set<string>();
  const by = (kind: UseKind) => uses.filter(u => u.kind === kind);
  const pair = (kind: Join["kind"], from: Use, to: Use) => {
    if (from.name !== to.name || from.place.key === to.place.key) return;
    if (kind === "variable" && from.scope === "scene" && from.place.scene !== to.place.scene) return;
    const key = `${kind}|${from.name}|${from.place.key}|${to.place.key}`;
    if (seen.has(key)) return;
    seen.add(key);
    joins.push({ kind, name: from.name, from: from.place, to: to.place });
  };
  const reads = by("reads");
  const hears = by("hears").filter(u => !CORE.includes(u.name));
  by("sets").forEach(set => reads.forEach(read => pair("variable", set, read)));
  by("emits").forEach(emit => hears.forEach(hear => pair("event", emit, hear)));
  return joins;
};

// ── The graph of a set of targets: the scene and the entity levels ────────────────────────────────────────────────

/** Collects nodes and edges once each; edges with a home are kept each (an op needs every one), derived ones once */
class Graph {
  nodes = new Map<string, GraphNode>();
  edges: GraphEdge[] = [];
  problems: Problem[] = [];
  #ids = new Set<string>();

  constructor(private registry: NodeRegistry) {}

  add(node: Omit<GraphNode, "ports">, params?: unknown): GraphNode {
    const known = this.nodes.get(node.id);
    if (known) return known;
    const full = { ...node, ports: this.registry.ports(node.kind, params) } as GraphNode;
    this.nodes.set(node.id, full);
    return full;
  }

  link(from: [string, string], to: [string, string], signal: Signal, label: string, home: Home | null): void {
    if (!home && this.edges.some(e => !e.home && e.from.join() === from.join() && e.to.join() === to.join() && e.label === label)) return;
    const base = `${from.join(":")}>${to.join(":")}`;
    let id = base;
    for (let n = 2; this.#ids.has(id); n++) id = `${base}~${n}`;
    this.#ids.add(id);
    this.edges.push({ id, from, to, signal, label, home });
  }

  flag(node: GraphNode, message: string): void {
    if (!node.problem) node.problem = message;
    if (!this.problems.some(p => p.message === message)) this.problems.push({ message, node: node.id });
  }
}

interface TargetsInput {
  scene: string;
  targets: ReadonlyArray<LogicTarget & { under?: number[] }>;
  /** Boxes that open the entity level (the scene level); none at the entity level, its nodes are leaves */
  enterEntities: boolean;
}

/** The graph of a scene's targets (or one target's subtree): today's Logic panel (#239) */
const targetsGraph = (content: LogicContent, uses: readonly Use[], { scene, targets, enterEntities }: TargetsInput, registry: NodeRegistry): Graph => {
  const plugins = content.plugins ?? [];
  const code = content.code ?? {};
  const g = new Graph(registry);

  const entityNode = (target: string, root: EntityData, path: number[]): GraphNode => {
    let node: EntityData | undefined = root;
    for (const i of path) node = node?.children?.[i];
    const enter: Context = { level: "entity", scene, target, path: [] };
    return g.add({
      id: `node:${pathKey(target, path)}`, kind: "node", label: node ? nodeLabel(node) : "?", detail: path.length ? `in ${target}` : `entity of ${target}`,
      pick: { kind: "node", target, path }, ...(enterEntities ? { enter } : {}),
    });
  };
  const eventNode = (name: string) =>
    g.add({ id: `event:${name}`, kind: "event", label: name, detail: CORE.includes(name) ? "core event" : "scene event", pick: null });
  const variableNode = (name: string) => g.add({ id: `var:${name}`, kind: "variable", label: name, detail: "variable", pick: null });
  const scopes = new Map<string, Set<string>>();
  const setIn = (name: string, scope: string) => scopes.set(name, (scopes.get(name) ?? new Set()).add(scope));

  // The rules of every node of every target, with what they hear, read, set, emit and act on
  const ruleVariables = new Set<string>();
  const ruleEvents = new Set<string>();
  for (const target of targets) {
    if (!target.entity) continue;
    const root = target.entity;
    let i = -1;
    for (const { node, path } of walk(root)) {
      const inside = startsWith(path, target.under ?? []);
      const owner = nodeLabel(node);
      const pick: LogicPick = { kind: "node", target: target.id, path };
      for (const { rule, component, index } of rulesOfNode(node)) {
        i++;
        if (!inside) continue;
        const home = (part: "on" | "when" | "do", at?: number): Home =>
          ({ doc: "entity", target: target.id, path, component, rule: index, part, ...(at === undefined ? {} : { index: at }) });
        const id = `rule:${pathKey(target.id, path)}#${i}`;
        g.add({ id, kind: "rule", label: `${owner} · rule ${i + 1}`, detail: conditionWords(rule.when), pick }, rule);
        if (isBehaviourNodeEvent(rule.on)) {
          const own = g.add({ id: `event:${pathKey(target.id, path)}:${rule.on}`, kind: "event", label: rule.on, detail: owner, pick });
          g.link([own.id, "out"], [id, "on"], "event", "on", home("on"));
        } else {
          ruleEvents.add(rule.on);
          g.link([eventNode(rule.on).id, "out"], [id, "on"], "event", "on", home("on"));
        }
        (rule.when?.tests ?? []).forEach((test, t) => {
          ruleVariables.add(test.name);
          g.link([variableNode(test.name).id, "get"], [id, "when"], "value", "when", home("when", t));
        });
        rule.do.forEach((action, a) => {
          const out: [string, string] = [id, `do:${a}`];
          switch (action.action) {
            case "set":
              ruleVariables.add(action.name);
              setIn(action.name, action.scope);
              g.link(out, [variableNode(action.name).id, "set"], "value", `set = ${valueWord(action.value)}`, home("do", a));
              break;
            case "emit":
              ruleEvents.add(action.event);
              g.link(out, [eventNode(action.event).id, "in"], "event", "emit", home("do", a));
              break;
            default: {
              const relative = pathOfName(node, action.node);
              if (relative) {
                const label = action.action === "play" ? `play ${action.clip || "its clip"}` : action.action;
                g.link(out, [entityNode(target.id, root, [...path, ...relative]).id, "in"], "node", label, home("do", a));
              } else {
                const missing = g.add({ id: `missing:${pathKey(target.id, path)}:${action.node}`, kind: "node", label: action.node, detail: `not under ${owner}`, pick });
                g.link(out, [missing.id, "in"], "node", action.action, home("do", a));
                g.flag(missing, `${owner}, rule ${i + 1}: ${action.action} names ${action.node} – no node of that name under ${owner}`);
              }
            }
          }
        });
      }
    }
  }

  // The plugins: on a node here (their component, node type, material), or touching the rules' events / variables
  const drawn = new Set<string>();
  const pluginNode = (id: string) => {
    drawn.add(id);
    return g.add({ id: `plugin:${id}`, kind: "plugin", label: id, detail: code[id] ? "plugin" : "plugin – its code not read", pick: { kind: "plugin", plugin: id } });
  };
  for (const target of targets) {
    if (!target.entity) continue;
    for (const { node, path } of walk(target.entity)) {
      if (!startsWith(path, target.under ?? [])) continue;
      const types: Array<[string | null, string]> = [
        ...(node.components ?? []).filter(c => !BUILT_IN_COMPONENTS.includes(c.type)).map((c): [string | null, string] => [pluginOfType(plugins, "components", c.type), c.type]),
        [pluginOfType(plugins, "nodeTypes", node.type), node.type],
        ...(node.material ? [[pluginOfType(plugins, "materials", node.material.type), node.material.type] as [string | null, string]] : []),
      ];
      for (const [plugin, type] of types) {
        if (plugin) g.link([pluginNode(plugin).id, "drives"], [entityNode(target.id, target.entity, path).id, "in"], "node", type, null);
      }
    }
  }
  for (const plugin of plugins) {
    const used = code[plugin.id];
    if (!used) continue;
    const touches = [...used.hears, ...used.emits].some(e => ruleEvents.has(e)) || [...used.reads, ...used.sets].some(v => ruleVariables.has(v));
    if (!touches && !drawn.has(plugin.id)) continue;
    const id = pluginNode(plugin.id).id;
    used.hears.forEach(e => g.link([eventNode(e).id, "out"], [id, "hears"], "event", "hears", null));
    used.emits.forEach(e => g.link([id, "emits"], [eventNode(e).id, "in"], "event", "emits", null));
    used.reads.forEach(v => g.link([variableNode(v).id, "get"], [id, "reads"], "value", "reads", null));
    used.sets.forEach(v => g.link([id, "sets"], [variableNode(v).id, "set"], "value", "sets", null));
  }
  scopes.forEach((set, name) => { const node = g.nodes.get(`var:${name}`); if (node) node.detail = `variable · ${[...set].join(", ")}`; });

  // Problems across the experience – only when every plugin's code is known (a plugin may set or emit anything)
  if (plugins.every(p => code[p.id])) {
    const ruleUse = (kind: UseKind) => new Set(uses.filter(u => u.kind === kind && (u.place.target !== null || u.place.plugin !== null)).map(u => u.name));
    const sets = ruleUse("sets");
    const emits = ruleUse("emits");
    const hears = ruleUse("hears");
    for (const node of g.nodes.values()) {
      if (node.kind === "variable" && g.edges.some(e => e.from[0] === node.id) && !sets.has(node.label)) {
        g.flag(node, `${node.label} is read, but nothing in the experience sets it`);
      }
      if (node.kind === "event" && node.id === `event:${node.label}` && !CORE.includes(node.label)) {
        if (g.edges.some(e => e.from[0] === node.id) && !emits.has(node.label)) g.flag(node, `${node.label} is heard, but nothing in the experience emits it – its rules never fire`);
        else if (g.edges.some(e => e.to[0] === node.id) && !hears.has(node.label)) g.flag(node, `${node.label} is emitted, but nothing in the experience hears it`);
      }
    }
  }
  return g;
};

// ── Levels ───────────────────────────────────────────────────────────────────────────────────────────────────

const sceneOf = (content: LogicContent, id: string) => content.scenes.find(s => s.id === id);
const groupOf = (content: LogicContent, scene: LogicScene | undefined) =>
  scene?.group ? content.groups?.find(g => g.id === scene.group) : undefined;

/** The levels from the experience down to `context`, root first: experience › group › scene › entity */
export const levelsOf = (content: LogicContent, context: Context): Context[] => {
  const levels: Context[] = [{ level: "experience" }];
  if (context.level === "experience") return levels;
  if (context.level === "group") return [...levels, context];
  const group = groupOf(content, sceneOf(content, context.scene));
  if (group) levels.push({ level: "group", group: group.id });
  levels.push({ level: "scene", scene: context.scene });
  if (context.level === "entity") {
    levels.push({ level: "entity", scene: context.scene, target: context.target, path: [] });
    if (context.path.length) levels.push(context);
  }
  return levels;
};

/** The words for a place outside the level, and the level that opens it */
const farOf = (content: LogicContent, place: Place, near: { scene: string }): { far: Context; words: string } => {
  if (place.plugin !== null) return { far: { level: "experience" }, words: `plugin ${place.plugin}` };
  const scene = place.scene!;
  if (scene === near.scene && place.target !== null) return { far: { level: "entity", scene, target: place.target, path: [] }, words: `target ${place.target}` };
  const label = sceneOf(content, scene)?.label ?? scene;
  return { far: { level: "scene", scene }, words: place.target === null ? `the texts of ${label}` : label };
};

const JOIN_WORDS = { variable: { in: "set in", out: "read in" }, event: { in: "emitted in", out: "heard in" } } as const;
const JOIN_PORTS = { variable: { from: "sets", to: "reads", near: { in: "set", out: "get" } }, event: { from: "emits", to: "hears", near: { in: "in", out: "out" } } } as const;

/**
 * The stubs of a level whose boxes are events and variables (scene, entity): a join with one end here, one outside – drawn
 * at the box of its name, one per side, name and far end
 */
const nameStubs = (content: LogicContent, g: Graph, joins: readonly Join[], isNear: (p: Place) => boolean, near: { scene: string }): Stub[] => {
  const stubs: Stub[] = [];
  for (const join of joins) {
    const fromNear = isNear(join.from);
    const toNear = isNear(join.to);
    if (fromNear === toNear) continue;
    const side = toNear ? "in" : "out";
    const farPlace = toNear ? join.from : join.to;
    if (farPlace.plugin !== null) continue; // a plugin touching this level's names is drawn in it
    const box = g.nodes.get(join.kind === "variable" ? `var:${join.name}` : `event:${join.name}`);
    if (!box) continue; // only a text here reads it: texts are no boxes of this level
    const { far, words } = farOf(content, farPlace, near);
    const farId = `far:${farPlace.key}`;
    const ports = JOIN_PORTS[join.kind];
    const signal: Signal = join.kind === "variable" ? "value" : "event";
    const label = `${join.name} ${side === "in" ? "←" : "→"} ${JOIN_WORDS[join.kind][side]} ${words}`;
    if (stubs.some(s => s.label === label)) continue;
    const edge: GraphEdge = side === "in"
      ? { id: `stub:${farId}>${box.id}:${join.name}`, from: [farId, ports.from], to: [box.id, ports.near.in], signal, label: join.name, home: null }
      : { id: `stub:${box.id}>${farId}:${join.name}`, from: [box.id, ports.near.out], to: [farId, ports.to], signal, label: join.name, home: null };
    stubs.push({ edge, side, far, label });
  }
  return stubs;
};

const sceneView = (content: LogicContent, context: Extract<Context, { level: "scene" | "entity" }>, uses: readonly Use[], registry: NodeRegistry): View => {
  const scene = sceneOf(content, context.scene);
  const levels = levelsOf(content, context);
  if (!scene) return { context, levels, nodes: [], edges: [], stubs: [], problems: [], canvas: EMPTY_CANVAS() };
  const entity = context.level === "entity";
  const targets = entity ? scene.targets.filter(t => t.id === context.target).map(t => ({ ...t, under: context.path })) : scene.targets;
  const g = targetsGraph(content, uses, { scene: scene.id, targets, enterEntities: !entity }, registry);
  // The scene level holds its texts too (no boxes, no stubs); the entity level only its target
  const isNear = (p: Place) => p.scene === scene.id && (!entity || p.target === context.target);
  const stubs = nameStubs(content, g, joinsOf(uses), isNear, { scene: scene.id });
  return { context, levels, nodes: [...g.nodes.values()], edges: g.edges, stubs, problems: g.problems, canvas: EMPTY_CANVAS() };
};

/** A place as a box of the group and experience levels: a scene (rules and texts together) or a plugin */
const boxOf = (place: Place) => (place.plugin !== null ? `plugin:${place.plugin}` : `scene:${place.scene}`);

/** The derived edges between boxes: one per kind and pair, with a count – the deck's bundled wires */
const bundle = (joins: readonly Join[]) => {
  const pairs = new Map<string, { kind: Join["kind"]; from: string; to: string; fromPlace: Place; toPlace: Place; names: Set<string> }>();
  for (const join of joins) {
    const from = boxOf(join.from);
    const to = boxOf(join.to);
    if (from === to) continue;
    const key = `${join.kind}|${from}|${to}`;
    const pair = pairs.get(key) ?? { kind: join.kind, from, to, fromPlace: join.from, toPlace: join.to, names: new Set<string>() };
    pair.names.add(join.name);
    pairs.set(key, pair);
  }
  return [...pairs.values()].map(p => {
    const names = [...p.names].sort();
    const label = names.length === 1 ? names[0] : plural(names.length, p.kind);
    const ports = JOIN_PORTS[p.kind];
    const edge: GraphEdge = { id: `${p.kind}:${p.from}>${p.to}`, from: [p.from, ports.from], to: [p.to, ports.to], signal: p.kind === "variable" ? "value" : "event", label, home: null };
    return { ...p, names, edge };
  });
};

/** How many rules a scene's targets hold */
const ruleCount = (scene: LogicScene) =>
  scene.targets.reduce((n, t) => n + (t.entity ? walk(t.entity).reduce((m, { node }) => m + rulesOfNode(node).length, 0) : 0), 0);

/** The problems of a set of scenes (each scene's, once), pointing at the scene's box */
const scenesProblems = (content: LogicContent, scenes: readonly LogicScene[], uses: readonly Use[], registry: NodeRegistry): Problem[] => {
  const problems: Problem[] = [];
  for (const scene of scenes) {
    for (const { message } of targetsGraph(content, uses, { scene: scene.id, targets: scene.targets, enterEntities: false }, registry).problems) {
      if (!problems.some(p => p.message === message)) problems.push({ message, node: `scene:${scene.id}` });
    }
  }
  return problems;
};

const sceneBox = (g: Graph, scene: LogicScene, group: string | undefined) =>
  g.add({
    id: `scene:${scene.id}`, kind: "scene", label: scene.label, detail: ruleCount(scene) ? plural(ruleCount(scene), "rule") : "no rules",
    pick: { kind: "scene", scene: scene.id }, enter: { level: "scene", scene: scene.id }, ...(group ? { group: `group:${group}` } : {}),
  });

const groupView = (content: LogicContent, context: Extract<Context, { level: "group" }>, uses: readonly Use[], registry: NodeRegistry): View => {
  const g = new Graph(registry);
  const scenes = content.scenes.filter(s => s.group === context.group);
  scenes.forEach(scene => sceneBox(g, scene, undefined));
  const inside = (p: Place) => p.scene !== null && scenes.some(s => s.id === p.scene);
  const stubs: Stub[] = [];
  const joins = joinsOf(uses).filter(j => j.from.scene !== j.to.scene);
  for (const pair of bundle(joins)) {
    const fromIn = inside(pair.fromPlace);
    const toIn = inside(pair.toPlace);
    if (fromIn && toIn) g.link(pair.edge.from, pair.edge.to, pair.edge.signal, pair.edge.label, null);
    else if (fromIn || toIn) {
      const side = toIn ? "in" : "out";
      const farPlace = toIn ? pair.fromPlace : pair.toPlace;
      const words = farPlace.plugin !== null ? `plugin ${farPlace.plugin}` : sceneOf(content, farPlace.scene!)?.label ?? farPlace.scene!;
      const far: Context = farPlace.plugin !== null ? { level: "experience" } : { level: "scene", scene: farPlace.scene! };
      stubs.push({ edge: pair.edge, side, far, label: `${pair.edge.label} ${side === "in" ? "←" : "→"} ${JOIN_WORDS[pair.kind][side]} ${words}` });
    }
  }
  return {
    context, levels: levelsOf(content, context), nodes: [...g.nodes.values()], edges: g.edges, stubs,
    problems: scenesProblems(content, scenes, uses, registry), canvas: EMPTY_CANVAS(),
  };
};

const experienceView = (content: LogicContent, context: Context, uses: readonly Use[], registry: NodeRegistry): View => {
  const g = new Graph(registry);
  const code = content.code ?? {};
  const groups = new Set((content.groups ?? []).map(group => group.id));
  for (const group of content.groups ?? []) {
    const count = content.scenes.filter(s => s.group === group.id).length;
    g.add({ id: `group:${group.id}`, kind: "group", label: group.label, detail: plural(count, "scene"), pick: { kind: "group", group: group.id }, enter: { level: "group", group: group.id } });
  }
  content.scenes.forEach(scene => sceneBox(g, scene, scene.group && groups.has(scene.group) ? scene.group : undefined));
  for (const plugin of content.plugins ?? []) {
    g.add({ id: `plugin:${plugin.id}`, kind: "plugin", label: plugin.id, detail: code[plugin.id] ? "plugin" : "plugin – its code not read", pick: { kind: "plugin", plugin: plugin.id } });
  }

  // Variables that cross scenes: set in a wider scope than the scene's, or by a plugin – through their own box
  const crossing = new Map<string, Set<string>>();
  for (const use of uses) {
    if (use.kind === "sets" && use.scope !== "scene") crossing.set(use.name, (crossing.get(use.name) ?? new Set()).add(use.scope ?? "plugin"));
  }
  const counted = new Map<string, { from: [string, string]; to: [string, string]; word: string; n: number }>();
  const count = (from: [string, string], to: [string, string], word: string) => {
    const key = `${from.join(":")}>${to.join(":")}`;
    const known = counted.get(key) ?? { from, to, word, n: 0 };
    known.n++;
    counted.set(key, known);
  };
  for (const [name, scopes] of crossing) {
    g.add({ id: `var:${name}`, kind: "variable", label: name, detail: `variable · ${[...scopes].join(", ")}`, pick: null });
  }
  for (const use of uses) {
    if ((use.kind === "sets" || use.kind === "reads") && crossing.has(use.name)) {
      if (use.kind === "sets") count([boxOf(use.place), "sets"], [`var:${use.name}`, "set"], "sets");
      else count([`var:${use.name}`, "get"], [boxOf(use.place), "reads"], "reads");
    }
    if (use.kind === "hears" && CORE.includes(use.name)) {
      g.add({ id: `event:${use.name}`, kind: "event", label: use.name, detail: "core event", pick: null });
      count([`event:${use.name}`, "out"], [boxOf(use.place), "hears"], "on");
    }
  }
  for (const { from, to, word, n } of counted.values()) {
    if (g.nodes.has(from[0]) && g.nodes.has(to[0])) g.link(from, to, from[0].startsWith("event:") ? "event" : "value", n > 1 ? `${word} · ${n}` : word, null);
  }

  // Events across places: one derived edge per pair (the bus joins them by name)
  const joins = joinsOf(uses).filter(j => j.kind === "event" && boxOf(j.from) !== boxOf(j.to));
  for (const pair of bundle(joins)) {
    if (g.nodes.has(pair.from) && g.nodes.has(pair.to)) g.link(pair.edge.from, pair.edge.to, "event", pair.edge.label, null);
  }
  return {
    context, levels: [{ level: "experience" }], nodes: [...g.nodes.values()], edges: g.edges, stubs: [],
    problems: scenesProblems(content, content.scenes, uses, registry), canvas: EMPTY_CANVAS(),
  };
};

/** The logic view of one level (see the module's comment) */
export const project = (content: LogicContent, context: Context, { registry = coreRegistry }: ProjectOptions = {}): View => {
  const uses = usesOf(content);
  switch (context.level) {
    case "experience": return experienceView(content, context, uses, registry);
    case "group": return groupView(content, context, uses, registry);
    default: return sceneView(content, context, uses, registry);
  }
};
