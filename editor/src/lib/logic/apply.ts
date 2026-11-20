import {
  BEHAVIOUR_CORE_EVENTS, BEHAVIOUR_TYPE, behaviourData, behaviourRules, isBehaviourNodeEvent,
  type BehaviourAction, type BehaviourRule, type BehaviourTest, type ComponentData, type EntityData,
} from "@engine/types";
import { CAMEL_CASE_NAME } from "@shared/guards/primitives";
import { newAction, pathOfName, rulesOf, withAction, withRules, withTest } from "#lib/behaviour-edit.js";
import { nodeLabel } from "#lib/tree.js";
import { nodeAt, withNode } from "#lib/values.js";
import { conditionWords, experienceProblems, project, type LogicContent, type ProjectOptions } from "./project";
import type { Context, GraphEdge, GraphNode, Home, Op, Problem, RulePlace, View } from "./types";

/**
 * `apply(op, docs)` (#334 L-T4, research §5.1, §5.5): an edit of the logic as an **op on the documents** – pure, no store, no
 * DOM. It returns the new documents with what happened **in words** (the panel's status line), the trees it changed (the
 * panel hands them to the stage, which saves them like the Inspector's edits) and the experience's `problems` after it; or a
 * **refusal with its reason**. Only entity rules are edited (a `behaviour` component of a target's node, `Home.doc` "entity");
 * scene and experience rules come with the content's next MAJOR. The rule grammar is `behaviour-edit.ts`'s and the shared
 * contract's – nothing here writes a rule another way.
 *
 * `connect` follows the ports of the grammar (`registry.ts`): an event's outlet → a rule's `on` writes the event's name into
 * `on` (the bus stays by name, L6); a variable → a rule's `when` adds a test; a rule's `do` → a node, a variable or an event
 * adds the matching action (show / hide / play / pause / stop, set, emit) – from an action's own `do:<i>` it re-aims that
 * action. `disconnect` removes what a wire stands for – a cut `on` leaves the rule hearing nothing, a problem until an event is
 * wired to it again (Tilman, 2026-11-20); a wire that only joins by name (`home: null`) removes the name from the listening
 * side here, and says so. Ports and wires are named by the level's view (`project`), so `connect` and
 * `disconnect` take the level (`context`).
 */

/** A tree an op changed: the target's whole new entity */
export interface TreeChange {
  scene: string;
  target: string;
  entity: EntityData;
}

export type OpResult =
  | { ok: true; content: LogicContent; changed: TreeChange[]; words: string; problems: Problem[] }
  | { ok: false; reason: string };

const CORE = BEHAVIOUR_CORE_EVENTS as readonly string[];
const isName = (name: string) => CAMEL_CASE_NAME.test(name);
const refuse = (reason: string): OpResult => ({ ok: false, reason });
const READ_ONLY = "The experience and group levels are read-only – open a scene or a target to edit its rules.";
const NOT_YET = "Rules on a scene or on the experience are not in the content yet – only a node's rules can be edited.";
const CODE = (plugin: string) => `The plugin ${plugin}'s code decides what it hears, emits, reads and sets – change it in the Code tab.`;

/** The experience's problems (the deck's "compile"): every scene's, once – what the Logic panel lists under the graph */
export const problems = (content: LogicContent, options: ProjectOptions = {}): Problem[] => experienceProblems(content, options);

// ── The documents: a target's tree, a node's rules ───────────────────────────────────────────────────────────

type EntityHome = Extract<Home, { doc: "entity" }>;
type RuleRef = Pick<EntityHome, "target" | "path" | "component" | "rule">;

/** Where a target sits in the content */
const findTarget = (content: LogicContent, target: string) => {
  for (const scene of content.scenes) {
    const found = scene.targets.find(t => t.id === target);
    if (found) return { scene, target: found };
  }
  return null;
};

/** The rule a home names, with its node and its tree – or why there is none */
const ruleAt = (content: LogicContent, ref: RuleRef) => {
  const found = findTarget(content, ref.target);
  const root = found?.target.entity;
  const node = root && nodeAt(root, ref.path);
  if (!found || !root || !node) return null;
  if (node.components?.[ref.component]?.type !== BEHAVIOUR_TYPE) return null;
  const rules = rulesOf(node, ref.component);
  const rule = rules[ref.rule];
  return rule ? { scene: found.scene.id, root, node, rules, rule } : null;
};

/** A rule's name as the canvas shows it: its node's label and its number in the target (the projection counts the same way) */
export const ruleName = (content: LogicContent, ref: RuleRef): string => {
  const root = findTarget(content, ref.target)?.target.entity;
  if (!root) return "the rule";
  let n = 0;
  const visit = (node: EntityData, path: number[]): string | null => {
    for (const [c, component] of (node.components ?? []).entries()) {
      if (component.type !== BEHAVIOUR_TYPE) continue;
      for (let r = 0; r < behaviourRules(component).length; r++) {
        n++;
        if (c === ref.component && r === ref.rule && path.join(".") === ref.path.join(".")) return `${nodeLabel(node)} · rule ${n}`;
      }
    }
    for (const [i, child] of (node.children ?? []).entries()) {
      const hit = visit(child, [...path, i]);
      if (hit) return hit;
    }
    return null;
  };
  return visit(root, []) ?? "the rule";
};

/** Edits on a working copy of the content; each tree changed is kept once, its newest form */
class Draft {
  changed = new Map<string, TreeChange>();
  constructor(public content: LogicContent) {}

  /** Replace a node's rules (its behaviour component at `component`, or a new one when `component` is past its components) */
  setRules(target: string, path: number[], component: number, rules: readonly BehaviourRule[]): void {
    const found = findTarget(this.content, target);
    const root = found?.target.entity;
    const node = root && nodeAt(root, path);
    if (!found || !root || !node) return;
    const nextNode = component >= (node.components?.length ?? 0)
      ? { ...node, components: [...(node.components ?? []), behaviourData(rules) as ComponentData] }
      : withRules(node, component, rules);
    const entity = withNode(root, path, nextNode);
    this.content = {
      ...this.content,
      scenes: this.content.scenes.map(s => (s.id !== found.scene.id ? s : { ...s, targets: s.targets.map(t => (t.id === target ? { ...t, entity } : t)) })),
    };
    this.changed.set(target, { scene: found.scene.id, target, entity });
  }

  setRule(ref: RuleRef, rule: BehaviourRule | undefined): void {
    const at = ruleAt(this.content, ref);
    if (!at) return;
    this.setRules(ref.target, ref.path, ref.component, rule ? at.rules.map((r, i) => (i === ref.rule ? rule : r)) : at.rules.filter((_, i) => i !== ref.rule));
  }

  done(words: string, options: ProjectOptions): OpResult {
    return { ok: true, content: this.content, changed: [...this.changed.values()], words, problems: problems(this.content, options) };
  }
}

// ── Words ────────────────────────────────────────────────────────────────────────────────────────────────

const valueWord = (value: unknown) => (value === null ? "unset" : JSON.stringify(value));

/** An action in words: `show lamp`, `hide its own node`, `set hasKey = true (scene)`, `emit doorOpened` */
export const actionWords = (action: BehaviourAction): string => {
  switch (action.action) {
    case "set": return `set ${action.name || "?"} = ${valueWord(action.value)} (${action.scope})`;
    case "emit": return `emit ${action.event || "?"}`;
    case "play": return `play ${action.clip || "its clip"}${action.node ? ` on ${action.node}` : ""}`;
    default: return `${action.action} ${action.node || "its own node"}`;
  }
};

// ── Checks the grammar makes ────────────────────────────────────────────────────────────────────────────────

/** Why an action cannot be written on this node (null: it can) */
const actionProblem = (node: EntityData, action: BehaviourAction): string | null => {
  switch (action.action) {
    case "set":
      return isName(action.name) ? null : `${action.name ? `"${action.name}"` : "An empty name"} is no variable name – camelCase letters and digits.`;
    case "emit":
      if (!isName(action.event)) return `${action.event ? `"${action.event}"` : "An empty name"} is no event name – camelCase letters and digits.`;
      return CORE.includes(action.event) ? `${action.event} is the engine's own event – a rule hears it, never emits it.` : null;
    default:
      return pathOfName(node, action.node) ? null : `No node named ${action.node} under ${nodeLabel(node)} – ${action.action} reaches only its own subtree.`;
  }
};

const testsProblem = (tests: readonly BehaviourTest[]): string | null => {
  const bad = tests.find(t => !isName(t.name));
  if (bad) return `${bad.name ? `"${bad.name}"` : "An empty name"} is no variable name – camelCase letters and digits.`;
  const names = tests.map(t => t.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  return twice ? `A condition tests ${twice} once.` : null;
};

// ── The ops ───────────────────────────────────────────────────────────────────────────────────────────────

const entityHome = (home: Home): EntityHome | null => (home.doc === "entity" ? home : null);

/** The level's scene: an op changes only the trees of the scene it shows */
const levelScene = (context: Context): string | null => (context.level === "scene" || context.level === "entity" ? context.scene : null);

/** Why a target's tree cannot be edited at this level (null: it can) */
const outside = (content: LogicContent, context: Context, target: string): string | null => {
  const found = findTarget(content, target);
  if (!found) return `There is no target ${target}.`;
  return found.scene.id === levelScene(context) ? null : `The target ${target} is in another scene – open it there to edit its rules.`;
};

const addRule = (draft: Draft, at: RulePlace, on: string, options: ProjectOptions): OpResult => {
  if (!isName(on)) return refuse(`"${on}" is no event – found, lost, tap, unlocked or an event's name (camelCase).`);
  const root = findTarget(draft.content, at.target)?.target.entity;
  const node = root && nodeAt(root, at.path);
  if (!node) return refuse("That node is not in the target's tree any more.");
  const component = (node.components ?? []).findIndex(c => c.type === BEHAVIOUR_TYPE);
  const at2 = component < 0 ? (node.components?.length ?? 0) : component;
  const rules = component < 0 ? [] : rulesOf(node, component);
  const rule: BehaviourRule = { on, when: null, do: [] };
  draft.setRules(at.target, at.path, at2, [...rules, rule]);
  const name = ruleName(draft.content, { target: at.target, path: at.path, component: at2, rule: rules.length });
  return draft.done(`Added ${name}: on ${on}, nothing to do yet – connect its do to a node, a variable or an event.`, options);
};

/** The rule a rule box stands for: the box carries its home (an on may be empty, so no wire has to say it) */
const ruleOfBox = (view: View, box: string): RuleRef | null => {
  const home = view.nodes.find(n => n.id === box)?.home;
  return home?.doc === "entity" ? { target: home.target, path: home.path, component: home.component, rule: home.rule } : null;
};

/** The view's box by id; a stub or a box standing for something elsewhere is no end an op can use */
const boxOf = (view: View, id: string): GraphNode | null => view.nodes.find(n => n.id === id) ?? null;

const KIND_WORDS: Record<string, string> = {
  event: "an event", rule: "a rule", variable: "a variable", node: "a node", plugin: "a plugin", scene: "a scene", group: "a group", far: "something elsewhere",
};
const kindWord = (node: GraphNode) => KIND_WORDS[node.kind] ?? node.kind;

/** The scene event a box stands for; null for a node's own event (`found` of the door) */
const sceneEvent = (node: GraphNode) => (node.kind === "event" && node.id === `event:${node.label}` ? node.label : null);

const connect = (draft: Draft, view: View, from: [string, string], to: [string, string], verb: BehaviourAction["action"] | undefined, options: ProjectOptions): OpResult => {
  let a = boxOf(view, from[0]);
  let b = boxOf(view, to[0]);
  if (!a || !b) return refuse("That end stands for something elsewhere – open its level to connect there.");
  let [aPort, bPort] = [from[1], to[1]];
  // A drag may start at an inlet: the wire still runs from the outlet to the inlet
  const isIn = (node: GraphNode, port: string) => node.ports.some(p => p.id === port && p.dir === "in");
  if (isIn(a, aPort) && !isIn(b, bPort)) [a, b, aPort, bPort] = [b, a, bPort, aPort];
  if (a.far || b.far) return refuse("That end stands for something elsewhere – open its level to connect there.");
  if (a.kind === "plugin" || b.kind === "plugin") return refuse(CODE((a.kind === "plugin" ? a : b).label));

  // An event or a variable into a rule: what it hears, what it tests
  if (b.kind === "rule") {
    const ref = ruleOfBox(view, b.id);
    const at = ref && ruleAt(draft.content, ref);
    if (!ref || !at) return refuse("That rule is not in the content any more.");
    const name = ruleName(draft.content, ref);
    if (bPort === "on") {
      if (a.kind !== "event" || aPort !== "out") return refuse(`A rule's on hears an event – not ${kindWord(a)}.`);
      const event = sceneEvent(a);
      if (event === null) {
        const own = a.pick?.kind === "node" ? a.pick : null;
        if (!own || own.target !== ref.target || own.path.join(".") !== ref.path.join(".")) {
          return refuse(`${a.label} is ${a.detail}'s own event – a rule hears the ${a.label} of its own node.`);
        }
      }
      const on = event ?? a.label;
      if (at.rule.on === on) return refuse(`${name} hears ${on} already.`);
      draft.setRule(ref, { ...at.rule, on });
      return draft.done(`${name} now hears ${on}${at.rule.on ? ` (was ${at.rule.on})` : ""}${event && !isBehaviourNodeEvent(event) ? " – by name, from whatever emits it" : ""}.`, options);
    }
    if (bPort === "when") {
      if (a.kind !== "variable" || aPort !== "get") return refuse(`A rule's when tests a variable – not ${kindWord(a)}.`);
      if (at.rule.when?.tests.some(t => t.name === a.label)) return refuse(`${name} tests ${a.label} already.`);
      const next = withTest(at.rule, at.rule.when?.tests.length ?? 0, { name: a.label, value: true, not: false });
      draft.setRule(ref, next);
      return draft.done(`${name} now runs only when ${conditionWords(next.when)}.`, options);
    }
    return refuse(`A rule takes an event at on and variables at when – a wire into ${bPort} is not one of them.`);
  }

  // A rule's do into a node, a variable or an event: an action
  if (a.kind === "rule" && (aPort === "do" || aPort.startsWith("do:"))) {
    const ref = ruleOfBox(view, a.id);
    const at = ref && ruleAt(draft.content, ref);
    if (!ref || !at) return refuse("That rule is not in the content any more.");
    const name = ruleName(draft.content, ref);
    const index = aPort === "do" ? null : Number(aPort.slice(3));
    const old = index === null ? null : at.rule.do[index];
    if (index !== null && !old) return refuse(`${name} has no action ${index + 1}.`);
    let action: BehaviourAction;
    if (b.kind === "node" && b.id.startsWith("node:") && b.pick?.kind === "node") {
      const { target, path } = b.pick;
      const inside = target === ref.target && ref.path.every((p, i) => path[i] === p);
      if (!inside) return refuse(`A rule acts on the nodes under its own node – ${b.label} is not under ${nodeLabel(at.node)}.`);
      const relative = path.slice(ref.path.length);
      const nodeName = relative.length ? nodeAt(at.node, relative)?.name ?? "" : "";
      if (relative.length && !nodeName) return refuse(`${b.label} has no name – name it in the Inspector, then a rule can reach it.`);
      if (relative.length && pathOfName(at.node, nodeName)?.join(".") !== relative.join(".")) {
        return refuse(`Another node named ${nodeName} comes first under ${nodeLabel(at.node)} – a rule reaches the first; rename one of them.`);
      }
      if (old && (old.action === "set" || old.action === "emit")) return refuse(`Action ${index! + 1} of ${name} is ${old.action} – it does not act on a node. Drag from the rule's + to add one.`);
      if (old && "node" in old) action = { ...old, node: nodeName };
      else {
        const v = verb && verb !== "set" && verb !== "emit" ? verb : "show";
        action = { ...newAction(v), node: nodeName } as BehaviourAction;
      }
    } else if (b.kind === "variable" && bPort === "set") {
      if (old && old.action !== "set") return refuse(`Action ${index! + 1} of ${name} is ${old.action} – it does not set a variable.`);
      action = old?.action === "set" ? { ...old, name: b.label } : { action: "set", name: b.label, value: true, scope: scopeOf(draft.content, b.label) };
    } else if (b.kind === "event" && bPort === "in") {
      const event = sceneEvent(b);
      if (event === null) return refuse(`${b.label} is ${b.detail}'s own event – a rule emits scene events.`);
      if (CORE.includes(event)) return refuse(`${event} is the engine's own event – a rule hears it, never emits it.`);
      if (old && old.action !== "emit") return refuse(`Action ${index! + 1} of ${name} is ${old.action} – it does not emit an event.`);
      action = { action: "emit", event };
    } else {
      return refuse(`A rule's do reaches a node, a variable or an event – not ${kindWord(b)}.`);
    }
    const problem = actionProblem(at.node, action);
    if (problem) return refuse(problem);
    if (old && JSON.stringify(old) === JSON.stringify(action)) return refuse(`${name} does that already.`);
    draft.setRule(ref, withAction(at.rule, index ?? at.rule.do.length, action));
    return draft.done(old ? `${name}: ${actionWords(old)} → ${actionWords(action)}.` : `${name} now also does: ${actionWords(action)}${verb ? "" : action.action === "show" ? " (pick another verb in the Inspector)" : ""}.`, options);
  }
  return refuse(`${a.label} (${kindWord(a).replace(/^an? /, "")}) → ${b.label} (${kindWord(b).replace(/^an? /, "")}): the rules have no such connection. A rule's on takes an event, its when a variable, its do reaches a node, a variable or an event.`);
};

/** The scope a variable is set in elsewhere (a new set reaches the same readers), else the scene's */
const scopeOf = (content: LogicContent, name: string) => {
  for (const scene of content.scenes) {
    for (const target of scene.targets) {
      const all = (node: EntityData): EntityData[] => [node, ...(node.children ?? []).flatMap(all)];
      for (const node of target.entity ? all(target.entity) : []) {
        for (const component of node.components ?? []) {
          if (component.type !== BEHAVIOUR_TYPE) continue;
          for (const rule of behaviourRules(component)) for (const a of rule.do) if (a.action === "set" && a.name === name) return a.scope;
        }
      }
    }
  }
  return "scene" as const;
};

const disconnect = (draft: Draft, view: View, id: string, options: ProjectOptions): OpResult => {
  const stub = view.stubs.find(s => s.edge.id === id);
  const edge: GraphEdge | undefined = view.edges.find(e => e.id === id) ?? stub?.edge;
  if (!edge) return refuse("That wire is not in the view any more.");
  const home = edge.home;
  if (home) {
    const h = entityHome(home);
    if (!h) return refuse(NOT_YET);
    const at = ruleAt(draft.content, h);
    if (!at) return refuse("That rule is not in the content any more.");
    const name = ruleName(draft.content, h);
    if (h.part === "on") {
      // Left empty, the rule hears nothing until an event is wired to its on – a problem the panel lists (Tilman, 2026-11-20)
      draft.setRule(h, { ...at.rule, on: "" });
      return draft.done(`${name} no longer hears ${at.rule.on} – it hears nothing until you wire an event to its on.`, options);
    }
    if (h.part === "when") {
      const test = at.rule.when?.tests[h.index ?? 0];
      if (!test) return refuse(`${name} has no such condition.`);
      const next = withTest(at.rule, h.index ?? 0, undefined);
      draft.setRule(h, next);
      return draft.done(`${name} no longer tests ${test.name} – it runs ${next.when ? `when ${conditionWords(next.when)}` : "always"}.`, options);
    }
    const action = at.rule.do[h.index ?? 0];
    if (!action) return refuse(`${name} has no such action.`);
    draft.setRule(h, withAction(at.rule, h.index ?? 0, undefined));
    return draft.done(`${name} no longer does: ${actionWords(action)}.`, options);
  }

  // A wire that joins by name: the name goes from the listening side, if that side is a rule here
  const ends = [edge.from[0], edge.to[0]];
  const plugin = ends.find(e => e.startsWith("plugin:")) ?? (/^far:plugin:/.test(ends.find(e => e.startsWith("far:")) ?? "") ? ends.find(e => e.startsWith("far:"))!.replace("far:", "") : null);
  if (plugin) return refuse(CODE(plugin.replace("plugin:", "")));
  const where = stub ? stub.label.replace(/^\S+ [←→] /, "") : "";
  if (stub?.side === "out") return refuse(`${edge.label} is ${where} – the listening side is there; open it to change it.`);
  if (edge.signal === "value") {
    const box = `var:${edge.label}`;
    const reads = view.edges.filter(e => e.from[0] === box && e.home?.doc === "entity" && e.home.part === "when");
    if (!reads.length) return refuse(`Nothing at this level reads ${edge.label}.`);
    const names: string[] = [];
    for (const read of reads) {
      const h = read.home as EntityHome;
      const at = ruleAt(draft.content, h);
      if (!at) continue;
      names.push(ruleName(draft.content, h));
      const tests = (at.rule.when?.tests ?? []).filter(t => t.name !== edge.label);
      draft.setRule(h, { ...at.rule, when: tests.length ? { match: at.rule.when!.match, tests } : null });
    }
    return draft.done(`${names.join(", ")} no longer test${names.length === 1 ? "s" : ""} ${edge.label}. The wire joined by name: ${edge.label} is still ${where || "set where it was"} – only the read here went.`, options);
  }
  if (edge.signal === "event") {
    const box = `event:${edge.label}`;
    const hears = view.edges.filter(e => e.from[0] === box && e.home?.doc === "entity" && e.home.part === "on");
    if (!hears.length) return refuse(`Nothing at this level hears ${edge.label}.`);
    const names: string[] = [];
    for (const hear of hears) {
      const h = hear.home as EntityHome;
      const at = ruleAt(draft.content, h);
      if (!at) continue;
      names.push(ruleName(draft.content, h));
      draft.setRule(h, { ...at.rule, on: "" });
    }
    return draft.done(`${names.join(", ")} no longer hear${names.length === 1 ? "s" : ""} ${edge.label} – ${names.length === 1 ? "it hears" : "they hear"} nothing until you wire an event to ${names.length === 1 ? "its" : "their"} on. The wire joined by name: ${edge.label} is still ${where || "emitted where it was"}.`, options);
  }
  return refuse("That wire is drawn from a name, not written in a rule – nothing to remove here.");
};

/** Apply an op to the documents, at the level `context` (see the module's comment) */
export const apply = (op: Op, content: LogicContent, context: Context, options: ProjectOptions = {}): OpResult => {
  if (context.level === "experience" || context.level === "group") return refuse(READ_ONLY);
  const draft = new Draft(content);
  switch (op.op) {
    case "canvas":
      return refuse("Canvas edits (groups, notes) are not here yet.");
    case "addRule": {
      const why = outside(content, context, op.at.target);
      return why ? refuse(why) : addRule(draft, op.at, op.on ?? "found", options);
    }
    case "connect":
    case "disconnect": {
      const view = project(content, context, options);
      return op.op === "connect" ? connect(draft, view, op.from, op.to, op.verb, options) : disconnect(draft, view, op.edge, options);
    }
    default: {
      const h = entityHome(op.home);
      if (!h) return refuse(NOT_YET);
      const why = outside(content, context, h.target);
      if (why) return refuse(why);
      const at = ruleAt(content, h);
      if (!at) return refuse("That rule is not in the content any more.");
      const name = ruleName(content, h);
      switch (op.op) {
        case "removeRule":
          draft.setRule(h, undefined);
          return draft.done(`Removed ${name} (on ${at.rule.on}${at.rule.do.length ? `, ${at.rule.do.map(actionWords).join(", ")}` : ""}).`, options);
        case "setCondition": {
          const problem = testsProblem(op.tests);
          if (problem) return refuse(problem);
          const when = op.tests.length ? { match: op.match ?? at.rule.when?.match ?? "all", tests: op.tests } : null;
          draft.setRule(h, { ...at.rule, when });
          return draft.done(`${name} now runs ${when ? `only when ${conditionWords(when)}` : "always"}.`, options);
        }
        case "addAction": {
          const problem = actionProblem(at.node, op.action);
          if (problem) return refuse(problem);
          draft.setRule(h, withAction(at.rule, at.rule.do.length, op.action));
          return draft.done(`${name} now also does: ${actionWords(op.action)}.`, options);
        }
        case "removeAction": {
          const action = at.rule.do[h.index ?? -1];
          if (!action) return refuse(`${name} has no action ${(h.index ?? -1) + 1}.`);
          draft.setRule(h, withAction(at.rule, h.index!, undefined));
          return draft.done(`${name} no longer does: ${actionWords(action)}.`, options);
        }
      }
    }
  }
};
