import {
  BEHAVIOUR_CORE_EVENTS, BEHAVIOUR_TYPE, behaviourRules, isBehaviourNodeEvent,
  type BehaviourCondition, type BehaviourRule, type EntityData, type PluginData,
} from "@engine/types";
import { pathOfName } from "./behaviour-edit";
import { nodeLabel } from "./tree";

/**
 * The **logic of a scene** as a graph (#239, the Logic panel – `panels/LogicPanel.svelte`): read-only, built from the
 * draft. Nodes are the **events** (a node's own `found` / `lost` / `tap` / `unlocked`, a scene event, a core event), the
 * **rules** of the scene's `behaviour` components, the **variables** they read and set, the **nodes** of the entities
 * they act on (play / pause / stop / show / hide) and the **plugins** whose components, node types or materials sit on
 * the scene's nodes. Edges say how they connect: an event starts a rule (`on`), a variable conditions it (`when`), a rule
 * sets a variable, emits an event or acts on a node, a plugin drives a node (its type).
 *
 * What a plugin hears, emits, reads and sets is not recorded by the content build; `pluginCodeUses` reads it from the
 * plugin's source as written (`api.events.on("x")`, `api.vars.set("x", …)` …) – a plugin is drawn when it sits on the
 * scene or touches an event or variable the scene's rules use. **Problems** look at the whole experience (rules and the
 * plugins' code): a variable read that nothing sets, an event heard that nothing emits, an event emitted that nothing
 * hears (a rule on it never fires), a node an action names that its subtree does not have. While a plugin's code is
 * unknown, only the last is said.
 * Pure: no DOM, no store – the panel hands in the scene, the experience's entity trees, the plugins and their code.
 */

export type LogicKind = "event" | "rule" | "variable" | "node" | "plugin";

/** What a click on a graph node selects in the workspace: a node of a target's entity, or a plugin in the Code tab */
export type LogicPick = { kind: "node"; target: string; path: number[] } | { kind: "plugin"; plugin: string };

export interface LogicNode {
  id: string;
  kind: LogicKind;
  /** The line it shows */
  label: string;
  /** The smaller second line: whose event, whose rule, the scopes a variable is set in, what a plugin is */
  detail: string;
  pick: LogicPick | null;
  /** What is wrong with it (drawn in the error colour), if anything */
  problem?: string;
}

export interface LogicEdge {
  from: string;
  to: string;
  /** The word on the edge: `on`, `when`, `set = true`, `emit`, `show`, a plugin's type … */
  label: string;
}

export interface LogicGraph {
  nodes: LogicNode[];
  edges: LogicEdge[];
  /** Every problem in words, in the order found */
  problems: string[];
}

/** What a plugin's code hears, emits, reads and sets – by name, as written in it */
export interface PluginUses {
  hears: string[];
  emits: string[];
  reads: string[];
  sets: string[];
}

/** A scene's targets as the engine maps them (the entity ref resolved) */
export interface LogicTarget {
  id: string;
  entity?: EntityData;
}

export interface LogicInput {
  /** The scene's targets */
  targets: readonly LogicTarget[];
  /** Every entity tree of the experience (this scene's too): where else variables are set and events emitted */
  experience?: readonly EntityData[];
  /** The experience's declared plugins with what they recorded (`registered`) */
  plugins?: readonly PluginData[];
  /** What each plugin's code uses, by plugin id; a plugin missing here is unknown */
  code?: Readonly<Record<string, PluginUses>>;
}

const NAME = "([A-Za-z][A-Za-z0-9]*)";
const QUOTE = "[\"'`]";
const CALL = (object: string, verbs: string) => new RegExp(`\\b${object}\\s*\\.\\s*(${verbs})\\s*\\(\\s*${QUOTE}${NAME}${QUOTE}`, "g");

/** What a plugin's source uses of the bus and the variables: `events.on/once/off/emit("x")`, `vars.get/on/set/delete("x")` */
export const pluginCodeUses = (source: string): PluginUses => {
  const uses = { hears: new Set<string>(), emits: new Set<string>(), reads: new Set<string>(), sets: new Set<string>() };
  for (const [, verb, name] of source.matchAll(CALL("events", "on|once|emit"))) (verb === "emit" ? uses.emits : uses.hears).add(name);
  for (const [, verb, name] of source.matchAll(CALL("vars", "get|on|set|delete"))) (verb === "set" || verb === "delete" ? uses.sets : uses.reads).add(name);
  return { hears: [...uses.hears].sort(), emits: [...uses.emits].sort(), reads: [...uses.reads].sort(), sets: [...uses.sets].sort() };
};

const CORE = BEHAVIOUR_CORE_EVENTS as readonly string[];
const BUILT_IN_COMPONENTS = [BEHAVIOUR_TYPE, "animation"];

const pathKey = (target: string, path: readonly number[]) => `${target}/${path.join(".")}`;

/** Every node of a tree with its path, depth first */
const walk = (node: EntityData, path: number[] = []): Array<{ node: EntityData; path: number[] }> =>
  [{ node, path }, ...(node.children ?? []).flatMap((child, i) => walk(child, [...path, i]))];

const rulesOfNode = (node: EntityData): BehaviourRule[] =>
  (node.components ?? []).filter(c => c.type === BEHAVIOUR_TYPE).flatMap(c => behaviourRules(c));

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

/** Where the experience sets variables and emits / hears events: its rules and the plugins' code */
const experienceUse = (trees: readonly EntityData[], code: Readonly<Record<string, PluginUses>>) => {
  const sets = new Set<string>();
  const emits = new Set<string>();
  const hears = new Set<string>();
  for (const tree of trees) {
    for (const { node } of walk(tree)) {
      for (const rule of rulesOfNode(node)) {
        if (!isBehaviourNodeEvent(rule.on)) hears.add(rule.on);
        for (const action of rule.do) {
          if (action.action === "set") sets.add(action.name);
          if (action.action === "emit") emits.add(action.event);
        }
      }
    }
  }
  for (const uses of Object.values(code)) {
    uses.sets.forEach(name => sets.add(name));
    uses.emits.forEach(name => emits.add(name));
    uses.hears.forEach(name => hears.add(name));
  }
  return { sets, emits, hears };
};

/** The logic graph of a scene (see the module's comment) */
export const sceneLogic = ({ targets, experience, plugins = [], code = {} }: LogicInput): LogicGraph => {
  const nodes = new Map<string, LogicNode>();
  const edges: LogicEdge[] = [];
  const problems: string[] = [];
  const add = (node: LogicNode): LogicNode => {
    const known = nodes.get(node.id);
    if (known) return known;
    nodes.set(node.id, node);
    return node;
  };
  const link = (from: string, to: string, label: string) => {
    if (!edges.some(e => e.from === from && e.to === to && e.label === label)) edges.push({ from, to, label });
  };
  const flag = (node: LogicNode, problem: string) => {
    if (!node.problem) node.problem = problem;
    if (!problems.includes(problem)) problems.push(problem);
  };

  const entityNode = (target: string, root: EntityData, path: number[]): LogicNode => {
    let node: EntityData | undefined = root;
    for (const i of path) node = node?.children?.[i];
    return add({ id: `node:${pathKey(target, path)}`, kind: "node", label: node ? nodeLabel(node) : "?", detail: path.length ? `in ${target}` : `entity of ${target}`, pick: { kind: "node", target, path } });
  };
  const eventNode = (name: string) =>
    add({ id: `event:${name}`, kind: "event", label: name, detail: CORE.includes(name) ? "core event" : "scene event", pick: null });
  const variableNode = (name: string) => add({ id: `var:${name}`, kind: "variable", label: name, detail: "variable", pick: null });
  const scopes = new Map<string, Set<string>>();
  const setIn = (name: string, scope: string) => scopes.set(name, (scopes.get(name) ?? new Set()).add(scope));

  // The rules of every node of every target, with what they hear, read, set, emit and act on
  const ruleVariables = new Set<string>();
  const ruleEvents = new Set<string>();
  for (const target of targets) {
    if (!target.entity) continue;
    const root = target.entity;
    for (const { node, path } of walk(root)) {
      const owner = nodeLabel(node);
      const pick: LogicPick = { kind: "node", target: target.id, path };
      rulesOfNode(node).forEach((rule, i) => {
        const id = `rule:${pathKey(target.id, path)}#${i}`;
        add({ id, kind: "rule", label: `${owner} · rule ${i + 1}`, detail: conditionWords(rule.when), pick });
        if (isBehaviourNodeEvent(rule.on)) {
          const own = add({ id: `event:${pathKey(target.id, path)}:${rule.on}`, kind: "event", label: rule.on, detail: owner, pick });
          link(own.id, id, "on");
        } else {
          ruleEvents.add(rule.on);
          link(eventNode(rule.on).id, id, "on");
        }
        for (const test of rule.when?.tests ?? []) {
          ruleVariables.add(test.name);
          link(variableNode(test.name).id, id, "when");
        }
        for (const action of rule.do) {
          switch (action.action) {
            case "set":
              ruleVariables.add(action.name);
              setIn(action.name, action.scope);
              link(id, variableNode(action.name).id, `set = ${valueWord(action.value)}`);
              break;
            case "emit":
              ruleEvents.add(action.event);
              link(id, eventNode(action.event).id, "emit");
              break;
            default: {
              const relative = pathOfName(node, action.node);
              if (relative) {
                link(id, entityNode(target.id, root, [...path, ...relative]).id, action.action === "play" ? `play ${action.clip || "its clip"}` : action.action);
              } else {
                const missing = add({ id: `missing:${pathKey(target.id, path)}:${action.node}`, kind: "node", label: action.node, detail: `not under ${owner}`, pick });
                link(id, missing.id, action.action);
                flag(missing, `${owner}, rule ${i + 1}: ${action.action} names ${action.node} – no node of that name under ${owner}`);
              }
            }
          }
        }
      });
    }
  }

  // The plugins: on a node of the scene (their component, node type, material), or touching the rules' events / variables
  const drawn = new Set<string>();
  const pluginNode = (id: string) => {
    drawn.add(id);
    const uses = code[id];
    return add({ id: `plugin:${id}`, kind: "plugin", label: id, detail: uses ? "plugin" : "plugin – its code not read", pick: { kind: "plugin", plugin: id } });
  };
  for (const target of targets) {
    if (!target.entity) continue;
    for (const { node, path } of walk(target.entity)) {
      const types: Array<[string | null, string]> = [
        ...(node.components ?? []).filter(c => !BUILT_IN_COMPONENTS.includes(c.type)).map((c): [string | null, string] => [pluginOfType(plugins, "components", c.type), c.type]),
        [pluginOfType(plugins, "nodeTypes", node.type), node.type],
        ...(node.material ? [[pluginOfType(plugins, "materials", node.material.type), node.material.type] as [string | null, string]] : []),
      ];
      for (const [plugin, type] of types) {
        if (plugin) link(pluginNode(plugin).id, entityNode(target.id, target.entity, path).id, type);
      }
    }
  }
  for (const plugin of plugins) {
    const uses = code[plugin.id];
    if (!uses) continue;
    const touches = [...uses.hears, ...uses.emits].some(e => ruleEvents.has(e)) || [...uses.reads, ...uses.sets].some(v => ruleVariables.has(v));
    if (!touches && !drawn.has(plugin.id)) continue;
    const id = pluginNode(plugin.id).id;
    uses.hears.forEach(e => link(eventNode(e).id, id, "hears"));
    uses.emits.forEach(e => link(id, eventNode(e).id, "emits"));
    uses.reads.forEach(v => link(variableNode(v).id, id, "reads"));
    uses.sets.forEach(v => link(id, variableNode(v).id, "sets"));
  }
  scopes.forEach((set, name) => { const node = nodes.get(`var:${name}`); if (node) node.detail = `variable · ${[...set].join(", ")}`; });

  // Problems across the experience – only when every plugin's code is known (a plugin may set or emit anything)
  if (plugins.every(p => code[p.id])) {
    const use = experienceUse(experience ?? targets.flatMap(t => (t.entity ? [t.entity] : [])), code);
    for (const node of nodes.values()) {
      if (node.kind === "variable" && edges.some(e => e.from === node.id) && !use.sets.has(node.label)) {
        flag(node, `${node.label} is read, but nothing in the experience sets it`);
      }
      if (node.kind === "event" && node.id === `event:${node.label}` && !CORE.includes(node.label)) {
        if (edges.some(e => e.from === node.id) && !use.emits.has(node.label)) flag(node, `${node.label} is heard, but nothing in the experience emits it – its rules never fire`);
        else if (edges.some(e => e.to === node.id) && !use.hears.has(node.label)) flag(node, `${node.label} is emitted, but nothing in the experience hears it`);
      }
    }
  }

  return { nodes: [...nodes.values()], edges, problems };
};
