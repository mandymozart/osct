import { BEHAVIOUR_CORE_EVENTS, BEHAVIOUR_NODE_EVENTS, type BehaviourAction, type BehaviourRule, type EntityData } from "@engine/types";
import { CAMEL_CASE_NAME } from "@shared/guards/primitives";
import { expressionVariables } from "@shared/text/expressions";
import { nodeAddress, sceneAddress } from "@shared/types/address";
import { appendCondition, experienceEvents, experienceVariables, literalOf, newAction, rulesOf, subtreeNames } from "#lib/behaviour-edit.js";
import { nodeLabel } from "#lib/tree.js";
import { nodeAt } from "#lib/values.js";
import { logicTypes, type LogicContent } from "./project";
import { coreRegistry, type NodeRegistry } from "./registry";
import type { Context, Home, NodeFamily, NodeOwner, Op, RulePlace, RuleRef } from "./types";

/**
 * **Which node types fit here** (#334 L-T4, L-T5b): the one list the Logic canvas's right-click menu and the Library's
 * *Nodes* read, so both offer the same things. `palette` is every type of the registry with what adding one does (or why it
 * is not added by hand – a node comes from the tree, a plugin from the Code tab); `addChoices` turns the types that fit the
 * level and the selection into concrete ops (`apply.ts`): a rule on the current node, the scene or the experience, an
 * action or a condition term for the selected rule (a goto per scene). A typed `emit fooBar` / `set fooBar` / `when fooBar`
 * / `rule on fooBar` that names nothing yet is offered as a new name. Values are typed (B7): a set or a compared variable
 * takes its declared default, else a placeholder of its type.
 */

export interface PaletteEntry {
  kind: string;
  family: NodeFamily;
  owner: NodeOwner;
  label: string;
  /** What adding one does, or why it is not added by hand */
  detail: string;
  /** It can be added on the canvas (by its menu or a drop) */
  addable: boolean;
}

const ADDS: Record<string, string> = {
  rule: "A rule on the current node, the scene or the experience: an event, a condition, actions",
  event: "A rule that hears an event",
  variable: "A term of the selected rule's condition on a variable",
  play: "The selected rule plays a clip", pause: "The selected rule pauses a clip", stop: "The selected rule stops a clip",
  show: "The selected rule shows a node", hide: "The selected rule hides a node",
  set: "The selected rule sets a variable", emit: "The selected rule emits an event",
  goto: "The selected rule goes to a scene",
};
const NOT_BY_HAND: Record<string, string> = {
  node: "Nodes come from the tree – add one there",
  plugin: "Plugins come from the Code tab",
  scene: "Scenes come from the Scenes panel",
  group: "Groups come from the Scenes panel",
  far: "Drawn for something at another level",
};
const LABELS: Record<string, string> = { rule: "Rule", event: "Event", variable: "Variable", node: "Node", plugin: "Plugin", scene: "Scene", group: "Group", far: "Elsewhere" };

/** Every node type of the registry, the addable ones first, with what adding one does */
export const palette = (registry: NodeRegistry = coreRegistry): PaletteEntry[] => {
  const entries = registry.all().map((t): PaletteEntry => {
    const core = t.owner === "core";
    const addable = core && t.kind in ADDS;
    const detail = addable ? ADDS[t.kind] : core ? NOT_BY_HAND[t.kind] ?? "Drawn by the view" : `Registered by ${t.owner} – custom nodes run later`;
    return { kind: t.kind, family: t.family, owner: t.owner, label: LABELS[t.kind] ?? t.kind, detail, addable };
  });
  return [...entries.filter(e => e.addable), ...entries.filter(e => !e.addable)];
};

/** What the menu offers: one op, or a line that says why nothing is offered */
export interface AddChoice {
  key: string;
  /** The node type it adds */
  kind: string;
  label: string;
  detail: string;
  op: Op | null;
  /** Why it cannot be chosen (shown, not chosen) */
  disabled?: string;
}

export type { RuleRef };

export interface AddContext {
  content: LogicContent;
  context: Context;
  /** Where a new rule goes (the selection's node, else the entity level's own, else the scene or the experience); null: none */
  place: RulePlace | null;
  /** The rule selected on the canvas; null: none */
  rule: RuleRef | null;
  /** Variables and events seen on the stage (a plugin's too), besides the rules' own */
  liveVariables?: readonly string[];
  liveEvents?: readonly string[];
}

const CORE = BEHAVIOUR_CORE_EVENTS as readonly string[];
const trees = (content: LogicContent): EntityData[] => content.scenes.flatMap(s => s.targets.flatMap(t => (t.entity ? [t.entity] : [])));
const logicRules = (content: LogicContent): BehaviourRule[] => [...(content.rules ?? []), ...content.scenes.flatMap(s => s.rules ?? [])];
const nodeOf = (content: LogicContent, target: string, path: number[]) => {
  for (const scene of content.scenes) {
    const root = scene.targets.find(t => t.id === target)?.entity;
    if (root) return nodeAt(root, path);
  }
  return undefined;
};
const home = (rule: RuleRef, part: "when" | "do"): Home => ({ ...rule, part });

/** The rule a ref names (undefined: not there) */
const ruleOf = (content: LogicContent, ref: RuleRef): BehaviourRule | undefined => {
  if (ref.doc === "experience") return content.rules?.[ref.rule];
  if (ref.doc === "scene") return content.scenes.find(s => s.id === ref.scene)?.rules?.[ref.rule];
  const node = nodeOf(content, ref.target, ref.path);
  return node ? rulesOf(node, ref.component)[ref.rule] : undefined;
};

/** Why a type does not fit here (null: it fits) */
export const fitsHere = (kind: string, a: Pick<AddContext, "context" | "place" | "rule">, registry: NodeRegistry = coreRegistry): string | null => {
  const entry = palette(registry).find(e => e.kind === kind);
  if (!entry) return `No node type ${kind}`;
  if (!entry.addable) return entry.detail;
  if (a.context.level === "group") return "This level is read-only – open a scene or a target";
  if (kind === "rule" || kind === "event") return a.place ? null : "Select a node first (here or in the tree)";
  if (!a.rule) return "Select a rule first";
  if (a.rule.doc === "experience" && (kind === "play" || kind === "pause" || kind === "stop" || kind === "show" || kind === "hide")) {
    return "Pick the node of an experience rule in its Inspector";
  }
  return null;
};

/** The choices of one type at this level, for this selection (none when it does not fit) */
const choicesOf = (kind: string, a: AddContext): AddChoice[] => {
  const extra = logicRules(a.content);
  const variables = [...new Set([...experienceVariables(trees(a.content), a.liveVariables, extra), ...Object.keys(a.content.variables ?? {})])].sort();
  const events = experienceEvents(trees(a.content), a.liveEvents, extra);
  const sceneEvents = events.filter(e => !CORE.includes(e));
  const types = logicTypes(a.content);
  if (kind === "rule" || kind === "event") {
    const place = a.place!;
    if (place.doc !== "entity") {
      const where = place.doc === "experience" ? "the experience" : `scene ${a.content.scenes.find(s => s.id === place.scene)?.label ?? place.scene}`;
      return (kind === "rule" ? events : sceneEvents).map(on => ({
        key: `${kind}:${on}`, kind, label: `rule on ${on}`, detail: `on ${where}`, op: { op: "addRule", at: place, on },
      }));
    }
    const owner = nodeOf(a.content, place.target, place.path);
    const where = owner ? nodeLabel(owner) : place.target;
    const ons = kind === "rule" ? [...BEHAVIOUR_NODE_EVENTS, ...events] : sceneEvents;
    return ons.map(on => ({
      key: `${kind}:${on}`, kind, label: `rule on ${on}`, detail: `on ${where}`, op: { op: "addRule", at: place, on },
    }));
  }
  const rule = a.rule!;
  const current = ruleOf(a.content, rule);
  if (!current) return [];
  if (kind === "variable") {
    const read = new Set(current.when ? expressionVariables(current.when) : []);
    return variables.filter(v => !read.has(v)).map(name => {
      const info = types.get(name);
      const term = !info || info.type === "boolean" ? name : `${name} == ${literalOf(info)}`;
      return { key: `when:${name}`, kind, label: `when ${term}`, detail: current.when ? `and ${current.when}` : "a condition",
        op: { op: "setCondition", home: home(rule, "when"), when: appendCondition(current.when, term) } };
    });
  }
  const add = (action: BehaviourAction, label: string, detail: string): AddChoice =>
    ({ key: `${kind}:${label}`, kind, label, detail, op: { op: "addAction", home: home(rule, "do"), action } });
  if (kind === "set") return variables.map(name => add({ action: "set", name, value: literalOf(types.get(name)) }, `set ${name} = ${literalOf(types.get(name))}`, types.get(name)?.type ?? "untyped"));
  if (kind === "emit") return sceneEvents.map(event => add({ action: "emit", event }, `emit ${event}`, "a scene event"));
  if (kind === "goto") return a.content.scenes.map(scene => add({ action: "goto", address: sceneAddress(scene.id) }, `goto ${scene.label}`, sceneAddress(scene.id)));
  if (rule.doc === "scene") {
    // A scene's rule names a node of its own scene's targets by address
    const scene = a.content.scenes.find(s => s.id === rule.scene);
    return (scene?.targets ?? []).flatMap(t => (t.entity ? ["", ...subtreeNames(t.entity).filter(n => n !== t.entity!.name)].map(name => {
      const address = nodeAddress(t.id, name);
      return add({ ...newAction(kind as "show"), node: address } as BehaviourAction, `${kind} ${address}`, name ? `in ${t.id}` : `entity of ${t.id}`);
    }) : []));
  }
  if (rule.doc !== "entity") return [];
  const node = nodeOf(a.content, rule.target, rule.path);
  if (!node) return [];
  return ["", ...subtreeNames(node).filter(n => n !== node.name)].map(name =>
    add({ ...newAction(kind as "show"), node: name } as BehaviourAction, `${kind} ${name || "its own node"}`, name ? `under ${nodeLabel(node)}` : nodeLabel(node)));
};

/** A typed new name: `emit fooBar`, `set fooBar`, `when fooBar`, `rule on fooBar` */
const typed = (query: string, a: AddContext): AddChoice | null => {
  const m = /^\s*(emit|set|when|rule on)\s+(\S+)\s*$/i.exec(query);
  if (!m || !CAMEL_CASE_NAME.test(m[2])) return null;
  const [word, name] = [m[1].toLowerCase(), m[2]];
  const kind = word === "rule on" ? "rule" : word === "when" ? "variable" : word;
  if (fitsHere(kind, a)) return null;
  if (kind === "rule") return { key: `new:${query}`, kind, label: `rule on ${name}`, detail: "a new event", op: { op: "addRule", at: a.place!, on: name } };
  const rule = a.rule!;
  const current = ruleOf(a.content, rule);
  if (kind === "variable") {
    return { key: `new:${query}`, kind, label: `when ${name}`, detail: "a new variable", op: { op: "setCondition", home: home(rule, "when"), when: appendCondition(current?.when ?? null, name) } };
  }
  const action: BehaviourAction = kind === "set" ? { action: "set", name, value: "true" } : { action: "emit", event: name };
  return { key: `new:${query}`, kind, label: kind === "set" ? `set ${name} = true` : `emit ${name}`, detail: kind === "set" ? "a new variable" : "a new event", op: { op: "addAction", home: home(rule, "do"), action } };
};

/**
 * What can be added here: the choices of every type that fits (or of `kind` alone – a type dropped from the Library), in the
 * palette's order, filtered by `query` (any word of the label); a type that does not fit is one disabled line saying why
 */
export const addChoices = (a: AddContext, { kind = null as string | null, query = "", registry = coreRegistry } = {}): AddChoice[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (c: AddChoice) => words.every(w => `${c.label} ${c.detail}`.toLowerCase().includes(w));
  const out: AddChoice[] = [];
  for (const entry of palette(registry).filter(e => (kind ? e.kind === kind : e.addable))) {
    const why = fitsHere(entry.kind, a, registry);
    if (why) {
      const label = entry.label.toLowerCase();
      // Types refused for one reason share a line: "play, pause, … – Select a rule first"
      const same = out.find(c => c.disabled === why);
      if (same) same.label = `${same.label}, ${label}`;
      else out.push({ key: `no:${entry.kind}`, kind: entry.kind, label, detail: why, op: null, disabled: why });
      continue;
    }
    out.push(...choicesOf(entry.kind, a).filter(match));
  }
  const fresh = typed(query, a);
  if (fresh && !out.some(c => c.label === fresh.label) && (!kind || fresh.kind === kind)) out.unshift(fresh);
  // The same rule on the same event is offered once (rule and event both offer `rule on bellRang`)
  return out.filter((c, i) => (c.op ? out.findIndex(o => o.op && o.label === c.label) === i : match(c)));
};
