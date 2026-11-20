import {
  BEHAVIOUR_CORE_EVENTS, BEHAVIOUR_TYPE, behaviourData, behaviourRules, isBehaviourNodeEvent,
  type BehaviourAction, type BehaviourRule, type ComponentData, type EntityData,
} from "@engine/types";
import { CAMEL_CASE_NAME } from "@shared/guards/primitives";
import { expressionVariables } from "@shared/text/expressions";
import { addressProblem, nodeAddress, parseAddress, sceneAddress } from "@shared/types/address";
import type { VariableInfo } from "@shared/types/variables";
import { appendCondition, literalOf, newAction, pathOfName, removeConditionTerms, rulesOf, setValueProblems, typeWord, whenProblems, withAction, withRules } from "#lib/behaviour-edit.js";
import { nodeLabel } from "#lib/tree.js";
import { nodeAt, withNode } from "#lib/values.js";
import { conditionWords, experienceProblems, logicRuleLabel, logicTypes, project, type LogicContent, type ProjectOptions } from "./project";
import type { Context, GraphEdge, GraphNode, Home, Op, Problem, RulePlace, RuleRef, View } from "./types";

/**
 * `apply(op, docs)` (#334 L-T4, L-T5b, research §5.1, §5.5): an edit of the logic as an **op on the documents** – pure, no
 * store, no DOM. It returns the new documents with what happened **in words** (the panel's status line), the trees it
 * changed (the panel hands them to the stage, which saves them like the Inspector's edits), the scene and experience rules it
 * changed (the panel saves them with `PUT …/scenes/{sid}` / `PUT …/logic`) and the experience's `problems` after it; or a
 * **refusal with its reason**. Rules live on a node (`Home.doc` "entity", a `behaviour` component), on a scene or on the
 * experience (content schema 5.0). The rule grammar is `behaviour-edit.ts`'s and the shared contract's – nothing here
 * writes a rule another way, and every expression it writes is type-checked first (B8).
 *
 * `connect` follows the ports of the grammar (`registry.ts`): an event's outlet → a rule's `on` writes the event's name into
 * `on` (the bus stays by name, L6); a variable → a rule's `when` adds a term to its condition (a boolean variable its name,
 * any other `name == <its default or a typed placeholder>`, joined with `&&`); a rule's `do` → a node, a variable, an event
 * or a scene box adds the matching action (show / hide / play / pause / stop, set, emit, goto) – from an action's own
 * `do:<i>` it re-aims that action. A scene's rule names a node of its own scene's targets by address. `disconnect` removes
 * what a wire stands for – a cut `on` leaves the rule hearing nothing, a problem until an event is wired to it again
 * (Tilman, 2026-11-20); a cut `when` takes the variable's terms out of a top-level `&&` / `||` chain (anything deeper is
 * the Inspector's); a wire that only joins by name (`home: null`) removes the name from the listening side here, and says
 * so. Ports and wires are named by the level's view (`project`), so `connect` and `disconnect` take the level (`context`).
 * The group level is read-only; the experience level edits the experience's rules only.
 */

/** A tree an op changed: the target's whole new entity */
export interface TreeChange {
  scene: string;
  target: string;
  entity: EntityData;
}

/** A scene's or the experience's rules an op changed: the whole new list */
export type LogicChange = { doc: "scene"; scene: string; rules: BehaviourRule[] } | { doc: "experience"; rules: BehaviourRule[] };

export type OpResult =
  | { ok: true; content: LogicContent; changed: TreeChange[]; logic: LogicChange[]; words: string; problems: Problem[] }
  | { ok: false; reason: string };

const CORE = BEHAVIOUR_CORE_EVENTS as readonly string[];
const isName = (name: string) => CAMEL_CASE_NAME.test(name);
const refuse = (reason: string): OpResult => ({ ok: false, reason });
const READ_ONLY = "The group level is read-only – open a scene or a target to edit its rules.";
const EXPERIENCE_ONLY = "Here only the experience's own rules are edited – open a scene or a target to edit its rules.";
const CODE = (plugin: string) => `The plugin ${plugin}'s code decides what it hears, emits, reads and sets – change it in the Code tab.`;
const INSPECTOR = "edit the condition in the Inspector";

/** The experience's problems (the deck's "compile"): what the Logic panel lists under the graph */
export const problems = (content: LogicContent, options: ProjectOptions = {}): Problem[] => experienceProblems(content, options);

// ── The documents: a target's tree, a node's rules, a scene's rules, the experience's ─────────────────────────────

type EntityRef = Extract<RuleRef, { doc: "entity" }>;
type LogicRef = Exclude<RuleRef, { doc: "entity" }>;

/** A home without its part: the rule it names */
export const refOf = (home: RuleRef): RuleRef =>
  home.doc === "entity" ? { doc: "entity", target: home.target, path: home.path, component: home.component, rule: home.rule }
    : home.doc === "scene" ? { doc: "scene", scene: home.scene, rule: home.rule } : { doc: "experience", rule: home.rule };

/** Where a target sits in the content */
const findTarget = (content: LogicContent, target: string) => {
  for (const scene of content.scenes) {
    const found = scene.targets.find(t => t.id === target);
    if (found) return { scene, target: found };
  }
  return null;
};

/** The rules of a scene's or the experience's logic */
const logicRulesOf = (content: LogicContent, ref: LogicRef): readonly BehaviourRule[] | null => {
  if (ref.doc === "experience") return content.rules ?? [];
  const scene = content.scenes.find(s => s.id === ref.scene);
  return scene ? scene.rules ?? [] : null;
};

interface RuleAt {
  /** The scene it belongs to; null: the experience's */
  scene: string | null;
  rules: readonly BehaviourRule[];
  rule: BehaviourRule;
  /** A node's rule: its node */
  node?: EntityData;
}

/** The rule a ref names, with its list (and its node) – or null when there is none */
const ruleAt = (content: LogicContent, ref: RuleRef): RuleAt | null => {
  if (ref.doc !== "entity") {
    const rules = logicRulesOf(content, ref);
    const rule = rules?.[ref.rule];
    return rules && rule ? { scene: ref.doc === "scene" ? ref.scene : null, rules, rule } : null;
  }
  const found = findTarget(content, ref.target);
  const root = found?.target.entity;
  const node = root && nodeAt(root, ref.path);
  if (!found || !root || !node) return null;
  if (node.components?.[ref.component]?.type !== BEHAVIOUR_TYPE) return null;
  const rules = rulesOf(node, ref.component);
  const rule = rules[ref.rule];
  return rule ? { scene: found.scene.id, rules, rule, node } : null;
};

/** A rule's name as the canvas shows it: its node's label and its number in the target (the projection counts the same way), or `scene rule 2` */
export const ruleName = (content: LogicContent, ref: RuleRef | Omit<EntityRef, "doc">): string => {
  if ("doc" in ref && ref.doc !== "entity") return logicRuleLabel(ref);
  const entity = ref as Omit<EntityRef, "doc">;
  const root = findTarget(content, entity.target)?.target.entity;
  if (!root) return "the rule";
  let n = 0;
  const visit = (node: EntityData, path: number[]): string | null => {
    for (const [c, component] of (node.components ?? []).entries()) {
      if (component.type !== BEHAVIOUR_TYPE) continue;
      for (let r = 0; r < behaviourRules(component).length; r++) {
        n++;
        if (c === entity.component && r === entity.rule && path.join(".") === entity.path.join(".")) return `${nodeLabel(node)} · rule ${n}`;
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

/** Edits on a working copy of the content; each tree and each rules list changed is kept once, its newest form */
class Draft {
  changed = new Map<string, TreeChange>();
  logic = new Map<string, LogicChange>();
  /** The variables' types before the op (declared, else inferred) */
  types: Map<string, VariableInfo>;
  constructor(public content: LogicContent) {
    this.types = logicTypes(content);
  }

  typeOf = (name: string) => this.types.get(name)?.type;

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

  /** Replace a scene's or the experience's rules */
  setLogic(ref: { doc: "scene"; scene: string } | { doc: "experience" }, rules: BehaviourRule[]): void {
    if (ref.doc === "experience") {
      this.content = { ...this.content, rules };
      this.logic.set("experience", { doc: "experience", rules });
    } else {
      this.content = { ...this.content, scenes: this.content.scenes.map(s => (s.id === ref.scene ? { ...s, rules } : s)) };
      this.logic.set(`scene:${ref.scene}`, { doc: "scene", scene: ref.scene, rules });
    }
  }

  setRule(ref: RuleRef, rule: BehaviourRule | undefined): void {
    const at = ruleAt(this.content, ref);
    if (!at) return;
    const rules = rule ? at.rules.map((r, i) => (i === ref.rule ? rule : r)) : at.rules.filter((_, i) => i !== ref.rule);
    if (ref.doc === "entity") this.setRules(ref.target, ref.path, ref.component, rules);
    else this.setLogic(ref, rules);
  }

  done(words: string, options: ProjectOptions): OpResult {
    return { ok: true, content: this.content, changed: [...this.changed.values()], logic: [...this.logic.values()], words, problems: problems(this.content, options) };
  }
}

// ── Words ────────────────────────────────────────────────────────────────────────────────────────────────

/** An action in words: `show lamp`, `hide its own node`, `set taps = taps + 1 (scene)`, `emit doorOpened`, `goto scene:epilogue` */
export const actionWords = (action: BehaviourAction): string => {
  switch (action.action) {
    case "set": return `set ${action.name || "?"} = ${action.value ?? "unset"}${action.scope ? ` (${action.scope})` : ""}`;
    case "emit": return `emit ${action.event || "?"}`;
    case "goto": return `goto ${action.address || "?"}`;
    case "play": return `play ${action.clip || "its clip"}${action.node ? ` on ${action.node}` : ""}`;
    default: return `${action.action} ${action.node || "its own node"}`;
  }
};

// ── Checks the grammar makes ────────────────────────────────────────────────────────────────────────────────

/** Why an action cannot be written in this rule (null: it can) */
const actionProblem = (draft: Draft, ref: RuleRef, at: RuleAt, action: BehaviourAction): string | null => {
  switch (action.action) {
    case "set": {
      if (!isName(action.name)) return `${action.name ? `"${action.name}"` : "An empty name"} is no variable name – camelCase letters and digits.`;
      const wrong = setValueProblems(action.value ?? "", action.name, draft.typeOf);
      return wrong.length ? `set ${action.name} = ${action.value}: ${wrong[0]}.` : null;
    }
    case "emit":
      if (!isName(action.event)) return `${action.event ? `"${action.event}"` : "An empty name"} is no event name – camelCase letters and digits.`;
      return CORE.includes(action.event) ? `${action.event} is the engine's own event – a rule hears it, never emits it.` : null;
    case "goto": {
      const problem = addressProblem(action.address, ["scene"]);
      if (problem) return `goto: ${problem}.`;
      const id = parseAddress(action.address)!.id;
      return draft.content.scenes.some(s => s.id === id) ? null : `The experience has no scene ${id}.`;
    }
    default: {
      if (ref.doc === "entity") {
        return pathOfName(at.node!, action.node) ? null : `No node named ${action.node} under ${nodeLabel(at.node!)} – ${action.action} reaches only its own subtree.`;
      }
      const problem = addressProblem(action.node, ["target"]);
      if (problem) return `A ${ref.doc}'s rule names a node by address – ${problem}.`;
      const address = parseAddress(action.node) as { id: string; node: string };
      const found = findTarget(draft.content, address.id);
      if (!found) return `There is no target ${address.id}.`;
      if (ref.doc === "scene" && found.scene.id !== ref.scene) return `The target ${address.id} is in another scene – a scene's rule acts on its own scene's targets.`;
      return found.target.entity && pathOfName(found.target.entity, address.node) ? null : `No node named ${address.node} on the target ${address.id}.`;
    }
  }
};

// ── The ops ───────────────────────────────────────────────────────────────────────────────────────────────

/** Why a rule cannot be edited at this level (null: it can) */
const outside = (content: LogicContent, context: Context, ref: RuleRef | RulePlace): string | null => {
  if (context.level === "group") return READ_ONLY;
  if (ref.doc === "experience") return context.level === "experience" ? null : "The experience's rules are edited on the experience level of the Logic view, or in its Inspector.";
  if (context.level === "experience") return EXPERIENCE_ONLY;
  if (ref.doc === "scene") return ref.scene === context.scene ? null : "That scene's rules are edited on its own level – open it there.";
  const found = findTarget(content, ref.target);
  if (!found) return `There is no target ${ref.target}.`;
  return found.scene.id === context.scene ? null : `The target ${ref.target} is in another scene – open it there to edit its rules.`;
};

/** The first event a scene's or the experience's new rule hears: when the scene opens */
const LOGIC_FIRST_EVENT = "sceneChanged";

const addRule = (draft: Draft, at: RulePlace, on: string | undefined, options: ProjectOptions): OpResult => {
  if (at.doc !== "entity") {
    const event = on ?? LOGIC_FIRST_EVENT;
    if (!isName(event)) return refuse(`"${event}" is no event – a scene event's name (camelCase) or a core event.`);
    if (isBehaviourNodeEvent(event)) return refuse(`${event} is a node's own event – a ${at.doc}'s rule hears the bus: a scene event or a core event.`);
    const rules = at.doc === "experience" ? draft.content.rules ?? [] : draft.content.scenes.find(s => s.id === at.scene)?.rules;
    if (!rules) return refuse(`There is no scene ${(at as { scene: string }).scene}.`);
    draft.setLogic(at, [...rules, { on: event, when: null, do: [] }]);
    const name = logicRuleLabel(at.doc === "experience" ? { doc: "experience", rule: rules.length } : { doc: "scene", scene: at.scene, rule: rules.length });
    return draft.done(`Added ${name}: on ${event}, nothing to do yet – connect its do to a node, a variable, an event or a scene.`, options);
  }
  const event = on ?? "found";
  if (!isName(event)) return refuse(`"${event}" is no event – found, lost, tap, unlocked or an event's name (camelCase).`);
  const root = findTarget(draft.content, at.target)?.target.entity;
  const node = root && nodeAt(root, at.path);
  if (!node) return refuse("That node is not in the target's tree any more.");
  const component = (node.components ?? []).findIndex(c => c.type === BEHAVIOUR_TYPE);
  const at2 = component < 0 ? (node.components?.length ?? 0) : component;
  const rules = component < 0 ? [] : rulesOf(node, component);
  draft.setRules(at.target, at.path, at2, [...rules, { on: event, when: null, do: [] }]);
  const name = ruleName(draft.content, { doc: "entity", target: at.target, path: at.path, component: at2, rule: rules.length });
  return draft.done(`Added ${name}: on ${event}, nothing to do yet – connect its do to a node, a variable, an event or a scene.`, options);
};

/** The rule a rule box stands for: the box carries its home (an on may be empty, so no wire has to say it) */
const ruleOfBox = (view: View, box: string): RuleRef | null => {
  const home = view.nodes.find(n => n.id === box)?.home;
  return home ? refOf(home) : null;
};

/** The view's box by id; a stub or a box standing for something elsewhere is no end an op can use */
const boxOf = (view: View, id: string): GraphNode | null => view.nodes.find(n => n.id === id) ?? null;

const KIND_WORDS: Record<string, string> = {
  event: "an event", rule: "a rule", variable: "a variable", node: "a node", plugin: "a plugin", scene: "a scene", group: "a group", far: "something elsewhere",
};
const kindWord = (node: GraphNode) => KIND_WORDS[node.kind] ?? node.kind;

/** The scene event a box stands for; null for a node's own event (`found` of the door) */
const sceneEvent = (node: GraphNode) => (node.kind === "event" && node.id === `event:${node.label}` ? node.label : null);

/** The term a variable wired into a condition adds: a boolean (or untyped) its name, any other `name == <literal>` */
const conditionTerm = (draft: Draft, name: string): { term: string; note: string } => {
  const info = draft.types.get(name);
  if (!info || info.type === "boolean") return { term: name, note: "" };
  const literal = literalOf(info);
  return { term: `${name} == ${literal}`, note: ` – ${name} is ${typeWord(info.type)}, so it is compared with ${literal}; change the value in the Inspector` };
};

const connect = (draft: Draft, view: View, context: Context, from: [string, string], to: [string, string], verb: BehaviourAction["action"] | undefined, options: ProjectOptions): OpResult => {
  let a = boxOf(view, from[0]);
  let b = boxOf(view, to[0]);
  if (!a || !b) return refuse("That end stands for something elsewhere – open its level to connect there.");
  let [aPort, bPort] = [from[1], to[1]];
  // A drag may start at an inlet: the wire still runs from the outlet to the inlet
  const isIn = (node: GraphNode, port: string) => node.ports.some(p => p.id === port && p.dir === "in");
  if (isIn(a, aPort) && !isIn(b, bPort)) [a, b, aPort, bPort] = [b, a, bPort, aPort];
  if (a.far || b.far) return refuse("That end stands for something elsewhere – open its level to connect there.");
  if (a.kind === "plugin" || b.kind === "plugin") return refuse(CODE((a.kind === "plugin" ? a : b).label));

  // An event or a variable into a rule: what it hears, what its condition reads
  if (b.kind === "rule") {
    const ref = ruleOfBox(view, b.id);
    const at = ref && ruleAt(draft.content, ref);
    if (!ref || !at) return refuse("That rule is not in the content any more.");
    const why = outside(draft.content, context, ref);
    if (why) return refuse(why);
    const name = ruleName(draft.content, ref);
    if (bPort === "on") {
      if (a.kind !== "event" || aPort !== "out") return refuse(`A rule's on hears an event – not ${kindWord(a)}.`);
      const event = sceneEvent(a);
      if (event === null) {
        if (ref.doc !== "entity") return refuse(`${a.label} is ${a.detail}'s own event – a ${ref.doc}'s rule hears the bus: a scene event or a core event.`);
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
      if (a.kind !== "variable" || aPort !== "get") return refuse(`A rule's when reads a variable – not ${kindWord(a)}.`);
      if (at.rule.when && expressionVariables(at.rule.when).includes(a.label)) return refuse(`${name} reads ${a.label} already – ${INSPECTOR}.`);
      const { term, note } = conditionTerm(draft, a.label);
      const when = appendCondition(at.rule.when, term);
      const wrong = whenProblems(when, draft.typeOf);
      if (wrong.length) return refuse(`${when}: ${wrong[0]} – ${INSPECTOR}.`);
      draft.setRule(ref, { ...at.rule, when });
      return draft.done(`${name} now runs only when ${when}${note}.`, options);
    }
    return refuse(`A rule takes an event at on and variables at when – a wire into ${bPort} is not one of them.`);
  }

  // A rule's do into a node, a variable, an event or a scene: an action
  if (a.kind === "rule" && (aPort === "do" || aPort.startsWith("do:"))) {
    const ref = ruleOfBox(view, a.id);
    const at = ref && ruleAt(draft.content, ref);
    if (!ref || !at) return refuse("That rule is not in the content any more.");
    const why = outside(draft.content, context, ref);
    if (why) return refuse(why);
    const name = ruleName(draft.content, ref);
    const index = aPort === "do" ? null : Number(aPort.slice(3));
    const old = index === null ? null : at.rule.do[index];
    if (index !== null && !old) return refuse(`${name} has no action ${index + 1}.`);
    const nodeVerb = (o: BehaviourAction | null) => !!o && "node" in o;
    let action: BehaviourAction;
    if (b.kind === "node" && b.id.startsWith("node:") && b.pick?.kind === "node") {
      const { target, path } = b.pick;
      let nodeName: string;
      if (ref.doc === "entity") {
        const inside = target === ref.target && ref.path.every((p, i) => path[i] === p);
        if (!inside) return refuse(`A rule acts on the nodes under its own node – ${b.label} is not under ${nodeLabel(at.node!)}.`);
        const relative = path.slice(ref.path.length);
        nodeName = relative.length ? nodeAt(at.node!, relative)?.name ?? "" : "";
        if (relative.length && !nodeName) return refuse(`${b.label} has no name – name it in the Inspector, then a rule can reach it.`);
        if (relative.length && pathOfName(at.node!, nodeName)?.join(".") !== relative.join(".")) {
          return refuse(`Another node named ${nodeName} comes first under ${nodeLabel(at.node!)} – a rule reaches the first; rename one of them.`);
        }
      } else {
        const found = findTarget(draft.content, target);
        const root = found?.target.entity;
        if (!found || !root) return refuse(`There is no target ${target}.`);
        if (ref.doc === "scene" && found.scene.id !== ref.scene) return refuse(`A scene's rule acts on its own scene's targets – ${target} is in another scene.`);
        const own = path.length ? nodeAt(root, path)?.name ?? "" : "";
        if (path.length && !own) return refuse(`${b.label} has no name – name it in the Inspector, then a rule can reach it.`);
        if (path.length && pathOfName(root, own)?.join(".") !== path.join(".")) {
          return refuse(`Another node named ${own} comes first on the target ${target} – a rule reaches the first; rename one of them.`);
        }
        nodeName = nodeAddress(target, own);
      }
      if (old && !nodeVerb(old)) return refuse(`Action ${index! + 1} of ${name} is ${old.action} – it does not act on a node. Drag from the rule's + to add one.`);
      if (old && "node" in old) action = { ...old, node: nodeName };
      else {
        const v = verb && (verb === "play" || verb === "pause" || verb === "stop" || verb === "show" || verb === "hide") ? verb : "show";
        action = { ...newAction(v), node: nodeName } as BehaviourAction;
      }
    } else if (b.kind === "variable" && bPort === "set") {
      if (old && old.action !== "set") return refuse(`Action ${index! + 1} of ${name} is ${old.action} – it does not set a variable.`);
      if (old?.action === "set") action = { ...old, name: b.label };
      else {
        const scope = draft.types.get(b.label)?.scope ? undefined : scopeOf(draft.content, b.label);
        action = { action: "set", name: b.label, value: literalOf(draft.types.get(b.label)), ...(scope ? { scope } : {}) };
      }
    } else if (b.kind === "event" && bPort === "in") {
      const event = sceneEvent(b);
      if (event === null) return refuse(`${b.label} is ${b.detail}'s own event – a rule emits scene events.`);
      if (CORE.includes(event)) return refuse(`${event} is the engine's own event – a rule hears it, never emits it.`);
      if (old && old.action !== "emit") return refuse(`Action ${index! + 1} of ${name} is ${old.action} – it does not emit an event.`);
      action = { action: "emit", event };
    } else if (b.kind === "scene" && b.pick?.kind === "scene" && (bPort === "arrives" || bPort === "in")) {
      if (old && old.action !== "goto") return refuse(`Action ${index! + 1} of ${name} is ${old.action} – it does not go to a scene.`);
      action = { action: "goto", address: sceneAddress(b.pick.scene) };
    } else if (b.kind === "scene" && bPort === "nodes") {
      return refuse(`Pick the node of ${b.label} in the Inspector – the experience level shows no nodes.`);
    } else {
      return refuse(`A rule's do reaches a node, a variable, an event or a scene – not ${kindWord(b)}.`);
    }
    const problem = actionProblem(draft, ref, at, action);
    if (problem) return refuse(problem);
    if (old && JSON.stringify(old) === JSON.stringify(action)) return refuse(`${name} does that already.`);
    draft.setRule(ref, withAction(at.rule, index ?? at.rule.do.length, action));
    return draft.done(old ? `${name}: ${actionWords(old)} → ${actionWords(action)}.` : `${name} now also does: ${actionWords(action)}${verb ? "" : action.action === "show" ? " (pick another verb in the Inspector)" : ""}.`, options);
  }
  return refuse(`${a.label} (${kindWord(a).replace(/^an? /, "")}) → ${b.label} (${kindWord(b).replace(/^an? /, "")}): the rules have no such connection. A rule's on takes an event, its when a variable, its do reaches a node, a variable, an event or a scene.`);
};

/** The scope a variable is set in elsewhere (a new set reaches the same readers); undefined: none – the declared one, else scene */
const scopeOf = (content: LogicContent, name: string) => {
  const all = (node: EntityData): EntityData[] => [node, ...(node.children ?? []).flatMap(all)];
  const lists: BehaviourRule[][] = [[...(content.rules ?? [])], ...content.scenes.flatMap(scene => [
    [...(scene.rules ?? [])],
    ...scene.targets.flatMap(t => (t.entity ? all(t.entity) : []).flatMap(node => (node.components ?? []).filter(c => c.type === BEHAVIOUR_TYPE).map(c => behaviourRules(c)))),
  ])];
  for (const rules of lists) for (const rule of rules) for (const a of rule.do) if (a.action === "set" && a.name === name && a.scope) return a.scope;
  return undefined;
};

/** A condition without a variable's terms – or the refusal that sends the author to the Inspector */
const withoutVariable = (draft: Draft, ref: RuleRef, at: RuleAt, variable: string): string | null | { refused: string } => {
  const removed = removeConditionTerms(at.rule.when, variable);
  if ("refused" in removed) return { refused: `${ruleName(draft.content, ref)} reads ${variable} inside its condition (${at.rule.when}) – ${INSPECTOR}.` };
  return removed.when;
};

const disconnect = (draft: Draft, view: View, context: Context, id: string, options: ProjectOptions): OpResult => {
  const stub = view.stubs.find(s => s.edge.id === id);
  const edge: GraphEdge | undefined = view.edges.find(e => e.id === id) ?? stub?.edge;
  if (!edge) return refuse("That wire is not in the view any more.");
  const home = edge.home;
  if (home) {
    const ref = refOf(home);
    const why = outside(draft.content, context, ref);
    if (why) return refuse(why);
    const at = ruleAt(draft.content, ref);
    if (!at) return refuse("That rule is not in the content any more.");
    const name = ruleName(draft.content, ref);
    if (home.part === "on") {
      // Left empty, the rule hears nothing until an event is wired to its on – a problem the panel lists (Tilman, 2026-11-20)
      draft.setRule(ref, { ...at.rule, on: "" });
      return draft.done(`${name} no longer hears ${at.rule.on} – it hears nothing until you wire an event to its on.`, options);
    }
    if (home.part === "when") {
      const variable = edge.from[0].replace(/^var:/, "");
      if (!at.rule.when || !expressionVariables(at.rule.when).includes(variable)) return refuse(`${name} does not read ${variable}.`);
      const when = withoutVariable(draft, ref, at, variable);
      if (when !== null && typeof when === "object") return refuse(when.refused);
      draft.setRule(ref, { ...at.rule, when });
      return draft.done(`${name} no longer reads ${variable} – it runs ${when ? `when ${when}` : "always"}.`, options);
    }
    const action = at.rule.do[home.index ?? 0];
    if (!action) return refuse(`${name} has no such action.`);
    draft.setRule(ref, withAction(at.rule, home.index ?? 0, undefined));
    return draft.done(`${name} no longer does: ${actionWords(action)}.`, options);
  }

  // A wire that joins by name: the name goes from the listening side, if that side is a rule here
  const ends = [edge.from[0], edge.to[0]];
  const plugin = ends.find(e => e.startsWith("plugin:")) ?? (/^far:plugin:/.test(ends.find(e => e.startsWith("far:")) ?? "") ? ends.find(e => e.startsWith("far:"))!.replace("far:", "") : null);
  if (plugin) return refuse(CODE(plugin.replace("plugin:", "")));
  if (edge.signal === "scene") return refuse("That goto is written in a scene's rules – open the scene (or the target) to remove it there.");
  const where = stub ? stub.label.replace(/^\S+ [←→] /, "") : "";
  if (stub?.side === "out") return refuse(`${edge.label} is ${where} – the listening side is there; open it to change it.`);
  const here = (e: GraphEdge) => !!e.home && !outside(draft.content, context, refOf(e.home));
  if (edge.signal === "value") {
    const box = `var:${edge.label}`;
    const reads = view.edges.filter(e => e.from[0] === box && e.home?.part === "when" && here(e));
    if (!reads.length) return refuse(`Nothing at this level reads ${edge.label}.`);
    const names: string[] = [];
    const done = new Set<string>();
    for (const read of reads) {
      const ref = refOf(read.home!);
      const key = JSON.stringify(ref);
      if (done.has(key)) continue;
      done.add(key);
      const at = ruleAt(draft.content, ref);
      if (!at) continue;
      const when = withoutVariable(draft, ref, at, edge.label);
      if (when !== null && typeof when === "object") return refuse(when.refused);
      names.push(ruleName(draft.content, ref));
      draft.setRule(ref, { ...at.rule, when });
    }
    return draft.done(`${names.join(", ")} no longer read${names.length === 1 ? "s" : ""} ${edge.label}. The wire joined by name: ${edge.label} is still ${where || "set where it was"} – only the read here went.`, options);
  }
  if (edge.signal === "event") {
    const box = `event:${edge.label}`;
    const hears = view.edges.filter(e => e.from[0] === box && e.home?.part === "on" && here(e));
    if (!hears.length) return refuse(`Nothing at this level hears ${edge.label}.`);
    const names: string[] = [];
    for (const hear of hears) {
      const ref = refOf(hear.home!);
      const at = ruleAt(draft.content, ref);
      if (!at) continue;
      names.push(ruleName(draft.content, ref));
      draft.setRule(ref, { ...at.rule, on: "" });
    }
    return draft.done(`${names.join(", ")} no longer hear${names.length === 1 ? "s" : ""} ${edge.label} – ${names.length === 1 ? "it hears" : "they hear"} nothing until you wire an event to ${names.length === 1 ? "its" : "their"} on. The wire joined by name: ${edge.label} is still ${where || "emitted where it was"}.`, options);
  }
  return refuse("That wire is drawn from a name, not written in a rule – nothing to remove here.");
};

/** Apply an op to the documents, at the level `context` (see the module's comment) */
export const apply = (op: Op, content: LogicContent, context: Context, options: ProjectOptions = {}): OpResult => {
  if (context.level === "group") return refuse(READ_ONLY);
  const draft = new Draft(content);
  switch (op.op) {
    case "canvas":
      return refuse("Canvas edits (groups, notes) are not here yet.");
    case "addRule": {
      const why = outside(content, context, op.at);
      return why ? refuse(why) : addRule(draft, op.at, op.on, options);
    }
    case "connect":
    case "disconnect": {
      const view = project(content, context, options);
      return op.op === "connect" ? connect(draft, view, context, op.from, op.to, op.verb, options) : disconnect(draft, view, context, op.edge, options);
    }
    default: {
      const ref = refOf(op.home);
      const why = outside(content, context, ref);
      if (why) return refuse(why);
      const at = ruleAt(content, ref);
      if (!at) return refuse("That rule is not in the content any more.");
      const name = ruleName(content, ref);
      switch (op.op) {
        case "removeRule":
          draft.setRule(ref, undefined);
          return draft.done(`Removed ${name} (on ${at.rule.on || "nothing"}${at.rule.do.length ? `, ${at.rule.do.map(actionWords).join(", ")}` : ""}).`, options);
        case "setCondition": {
          const when = op.when?.trim() || null;
          const wrong = when ? whenProblems(when, draft.typeOf) : [];
          if (wrong.length) return refuse(`${when}: ${wrong[0]}.`);
          draft.setRule(ref, { ...at.rule, when });
          return draft.done(`${name} now runs ${when ? `only when ${conditionWords(when)}` : "always"}.`, options);
        }
        case "addAction": {
          const problem = actionProblem(draft, ref, at, op.action);
          if (problem) return refuse(problem);
          draft.setRule(ref, withAction(at.rule, at.rule.do.length, op.action));
          return draft.done(`${name} now also does: ${actionWords(op.action)}.`, options);
        }
        case "removeAction": {
          const action = at.rule.do[op.home.index ?? -1];
          if (!action) return refuse(`${name} has no action ${(op.home.index ?? -1) + 1}.`);
          draft.setRule(ref, withAction(at.rule, op.home.index!, undefined));
          return draft.done(`${name} no longer does: ${actionWords(action)}.`, options);
        }
      }
    }
  }
};
