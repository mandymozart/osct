import { BEHAVIOUR_CORE_EVENTS, BEHAVIOUR_TYPE, behaviourRules, type BehaviourRule, type BehaviourScope, type EntityData } from "@engine/types";
import type { VariableInfo, VariableType } from "@shared/types/variables";
import type { LogicContent } from "./project";
import type { Context, GraphNode, RuleRef } from "./types";

/**
 * **Testing on the stage from the Logic canvas** (#334, Tilman 2026-11-21: "is there a way i can manually trigger an event
 * from the nodes to test what firing them would look like down the line?"): what a box's right-click menu offers to set off
 * on the running stage, and the small parsers its fields need. Pure – the panel asks the stage (`Stage.fire`, `setVar`,
 * `runRule`, `tap`) and words the answer.
 *
 * - **An event box** (a bus event): *Fire on stage* – emitted as a plugin's `emit` would (the open scene's rules and the
 *   experience's that hear it run, every plugin hears it); *Fire with a payload…* takes `key: value` pairs. A core event is
 *   the engine's own (refused: find, tap or set on the stage instead). A node's own `tap` box taps its target (the reader's
 *   tap, every node of it hears it); its `found`, `lost`, `unlocked` are the stage's hooks – run the rule instead.
 * - **A variable box**: *Set on stage…* – a value by the variable's type, written as the Variables tab writes it (`varChanged`).
 * - **A rule box**: *Run this rule* – its actions as if its event had come; its condition applies, no other rule runs.
 *
 * Only the running stage changes, never the draft (Restart on the stage resets it); read-only levels allow it – it is a test,
 * not an edit. Every item is disabled with a reason while the stage does not run, or when what it names is not on the stage.
 */

/** What an item does on the stage */
export type StageAction =
  | { kind: "fire"; event: string; ask: boolean }
  | { kind: "tap"; target: string }
  | { kind: "set"; name: string; type: VariableType | null; scope: BehaviourScope }
  | { kind: "run"; home: { targetId: string; node: string } | { home: "scene"; scene: string } | { home: "experience" }; rule: number; on: string };

export interface StageItem {
  key: string;
  label: string;
  detail: string;
  /** Why it cannot be chosen now; null: it can */
  disabled: string | null;
  action: StageAction;
}

/** What the items need to know of the stage and the level */
export interface StageWhere {
  /** The stage runs (its status `running`) */
  running: boolean;
  /** The scene on the stage */
  scene: string | null;
  /** The level drawn */
  context: Context;
  /** Every variable's type (`logicTypes`) */
  types: ReadonlyMap<string, VariableInfo>;
  /** The variables on the stage now, with their scopes */
  vars: ReadonlyArray<{ scope: BehaviourScope; name: string; value: unknown }>;
}

export const NOT_RUNNING = "The stage is not running – start it (or wait until it runs).";
const CORE = BEHAVIOUR_CORE_EVENTS as readonly string[];

const sceneLabel = (content: Pick<LogicContent, "scenes">, id: string) => content.scenes.find(s => s.id === id)?.label || id;
const sceneOfTarget = (content: Pick<LogicContent, "scenes">, target: string, prefer?: string | null): string | undefined =>
  (content.scenes.find(s => s.id === prefer && s.targets.some(t => t.id === target)) ?? content.scenes.find(s => s.targets.some(t => t.id === target)))?.id;
const levelScene = (context: Context): string | null => (context.level === "scene" || context.level === "entity" ? context.scene : null);

const nodeAt = (root: EntityData | undefined, path: readonly number[]): EntityData | undefined => {
  let node = root;
  for (const i of path) node = node?.children?.[i];
  return node;
};

/** Every node of a tree with its path */
const walk = (node: EntityData, path: number[] = []): Array<{ node: EntityData; path: number[] }> =>
  [{ node, path }, ...(node.children ?? []).flatMap((child, i) => walk(child, [...path, i]))];

/** The rule a rule box stands for, from the draft */
export const ruleOf = (content: Pick<LogicContent, "scenes" | "rules">, ref: RuleRef, prefer?: string | null): BehaviourRule | undefined => {
  if (ref.doc === "experience") return content.rules?.[ref.rule];
  if (ref.doc === "scene") return content.scenes.find(s => s.id === ref.scene)?.rules?.[ref.rule];
  const scene = sceneOfTarget(content, ref.target, prefer);
  const node = nodeAt(content.scenes.find(s => s.id === scene)?.targets.find(t => t.id === ref.target)?.entity, ref.path);
  const component = node?.components?.[ref.component];
  return component?.type === BEHAVIOUR_TYPE ? behaviourRules(component)[ref.rule] : undefined;
};

/** Where a `set` without a scope of its own writes a variable: the stage's scope of it, the declared one, the rules' first set, else scene */
export const scopeOf = (content: Pick<LogicContent, "scenes" | "rules" | "variables">, name: string, vars: StageWhere["vars"] = []): BehaviourScope => {
  const live = vars.find(v => v.name === name)?.scope;
  if (live) return live;
  const declared = content.variables?.[name]?.scope;
  if (declared) return declared;
  const lists: Array<readonly BehaviourRule[]> = [content.rules ?? []];
  for (const scene of content.scenes) {
    lists.push(scene.rules ?? []);
    for (const target of scene.targets) {
      if (target.entity) for (const { node } of walk(target.entity)) for (const c of node.components ?? []) if (c.type === BEHAVIOUR_TYPE) lists.push(behaviourRules(c));
    }
  }
  for (const rules of lists) for (const rule of rules) for (const action of rule.do) if (action.action === "set" && action.name === name && action.scope) return action.scope;
  return "scene";
};

/** The items of a box's menu that set something off on the stage (none for a box of another kind) */
export const stageItems = (node: GraphNode, content: Pick<LogicContent, "scenes" | "rules" | "variables">, where: StageWhere): StageItem[] => {
  const off = where.running ? null : NOT_RUNNING;
  const at = levelScene(where.context);
  if (node.kind === "event") {
    // A node's own event (`event:<target>/<path>:<on>`): a hook of its node, not the bus
    if (node.id.includes("/")) {
      const target = node.pick?.kind === "node" ? node.pick.target : null;
      if (!target) return [];
      if (node.label === "tap") {
        const scene = sceneOfTarget(content, target, at);
        const away = scene && scene !== where.scene ? `${target} is in ${sceneLabel(content, scene)}, not on the stage – open that scene to tap it.` : null;
        return [{
          key: "stage:tap", label: "Tap on stage", detail: `the reader's tap on ${target} – every node of it hears tap, plugins targetTapped`,
          disabled: off ?? away, action: { kind: "tap", target },
        }];
      }
      return [{
        key: "stage:fire", label: "Fire on stage", detail: "a node's own hook",
        disabled: `${node.label} is ${target}'s own hook – the stage fires it (${node.label === "found" ? "show the target" : node.label === "lost" ? "hide the target" : "find it the first time"}); right-click its rule and Run this rule instead.`,
        action: { kind: "fire", event: node.label, ask: false },
      }];
    }
    const event = node.label;
    const core = CORE.includes(event) ? `${event} is a core event – the engine emits it (find or tap a target, set a variable on the stage); a rule on it runs with Run this rule.` : null;
    // The bus is one for the stage: what hears it is what the stage has built – the open scene's rules, the experience's, the plugins
    const elsewhere = at && at !== where.scene;
    const detail = elsewhere
      ? `on the bus – the open scene's rules, the experience's and every plugin hear it; ${sceneLabel(content, at)}'s own rules are not on the stage`
      : at ? "on the bus – the rules that hear it and every plugin; the Log marks it by hand"
        : "on the bus – the open scene's rules, the experience's and every plugin hear it";
    return [
      { key: "stage:fire", label: "Fire on stage", detail, disabled: off ?? core, action: { kind: "fire", event, ask: false } },
      { key: "stage:fire-with", label: "Fire with a payload…", detail: "key: value pairs, as a plugin's emit sends them", disabled: off ?? core, action: { kind: "fire", event, ask: true } },
    ];
  }
  if (node.kind === "variable") {
    const name = node.label;
    const type = where.types.get(name)?.type ?? null;
    const scope = scopeOf(content, name, where.vars);
    const now = where.vars.find(v => v.name === name);
    return [{
      key: "stage:set", label: "Set on stage…",
      detail: `${type ?? "untyped"} · ${scope}${now ? ` · now ${JSON.stringify(now.value)}` : ""} – varChanged, as the Variables tab writes it`,
      disabled: off, action: { kind: "set", name, type, scope },
    }];
  }
  if (node.kind === "rule" && node.home) {
    const ref: RuleRef = node.home.doc === "entity"
      ? { doc: "entity", target: node.home.target, path: node.home.path, component: node.home.component, rule: node.home.rule }
      : node.home.doc === "scene" ? { doc: "scene", scene: node.home.scene, rule: node.home.rule } : { doc: "experience", rule: node.home.rule };
    const rule = ruleOf(content, ref, at);
    if (!rule) return [];
    const words = rule.on
      ? `as if ${rule.on} came – ${rule.when?.trim() ? `its when (${rule.when.trim()}) applies` : "no when, it always runs"}; only this rule`
      : "it hears nothing yet";
    let away: string | null = null;
    const action = (home: Extract<StageAction, { kind: "run" }>["home"]): StageItem => ({
      key: "stage:run", label: "Run this rule", detail: words, disabled: off ?? away ?? (rule.on ? null : "It hears no event yet – give it one first."), action: { kind: "run", home, rule: ref.rule, on: rule.on },
    });
    if (ref.doc === "experience") return [action({ home: "experience" })];
    if (ref.doc === "scene") {
      if (ref.scene !== where.scene) away = `${sceneLabel(content, ref.scene)} is not on the stage – open it to run its rules.`;
      return [action({ home: "scene", scene: ref.scene })];
    }
    const scene = sceneOfTarget(content, ref.target, at);
    if (scene !== where.scene) away = `${ref.target} is in ${scene ? sceneLabel(content, scene) : "another scene"}, not on the stage – open that scene to run its rules.`;
    // The stage knows a node's rules by its target and its name: two nodes of one name with rules cannot be told apart
    const root = content.scenes.find(s => s.id === scene)?.targets.find(t => t.id === ref.target)?.entity;
    const name = nodeAt(root, ref.path)?.name?.trim() ?? "";
    const twins = root ? walk(root).filter(n => (n.node.name?.trim() ?? "") === name && n.node.components?.some(c => c.type === BEHAVIOUR_TYPE)).length : 0;
    if (!away && twins > 1) away = `${twins} nodes of ${ref.target} with rules are ${name ? `named ${name}` : "unnamed"} – the stage cannot tell them apart; give this node a name of its own.`;
    return [action({ targetId: ref.target, node: name })];
  }
  return [];
};

// ── The fields ──

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Split at commas, new lines and ` · ` outside quotes and brackets */
const splitPairs = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      current += c;
      if (c === "\\") current += text[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    if (depth === 0 && (c === "," || c === "\n" || (c === "·" && text[i - 1] === " " && text[i + 1] === " "))) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts.map(p => p.trim()).filter(Boolean);
};

/** A value as typed: JSON when it reads as JSON (`3`, `true`, `"a, b"`, `[1, 2]`), a single-quoted text, else the text itself */
const loose = (raw: string): unknown => {
  const text = raw.trim();
  if (/^'.*'$/s.test(text)) return text.slice(1, -1);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * A payload typed as `key: value` pairs (`door: "front", tries: 2`; commas, new lines or ` · ` between them – the Log's own
 * form reads back): each value JSON where it reads as JSON, else the text. Empty: no payload.
 */
export const parsePayload = (text: string): Parsed<Record<string, unknown> | undefined> => {
  const pairs = splitPairs(text);
  if (!pairs.length) return { ok: true, value: undefined };
  const payload: Record<string, unknown> = {};
  for (const pair of pairs) {
    const m = /^([A-Za-z_$][\w$]*)\s*[:=]\s*([\s\S]*)$/.exec(pair);
    if (!m) return { ok: false, reason: `“${pair}” – write key: value (a key is letters and digits)` };
    if (!m[2].trim()) return { ok: false, reason: `${m[1]} has no value – write ${m[1]}: value` };
    payload[m[1]] = loose(m[2]);
  }
  return { ok: true, value: payload };
};

/** A variable's value as typed, by its type; an untyped variable takes true / false, a number, else the text */
export const parseValue = (type: VariableType | null, text: string): Parsed<string | number | boolean> => {
  const raw = text.trim();
  if (!raw) return { ok: false, reason: type === "string" ? "Type the text (\"\" for an empty one)." : "Type a value." };
  const unquoted = /^".*"$/s.test(raw) ? (() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })() : null;
  if (type === "string") return { ok: true, value: typeof unquoted === "string" ? unquoted : raw };
  if (type === "boolean") {
    if (raw === "true" || raw === "false") return { ok: true, value: raw === "true" };
    return { ok: false, reason: `${raw} is no boolean – true or false.` };
  }
  const number = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(raw) ? Number(raw) : NaN;
  if (type === "integer") return Number.isInteger(number) ? { ok: true, value: number } : { ok: false, reason: `${raw} is no integer.` };
  if (type === "number") return Number.isFinite(number) ? { ok: true, value: number } : { ok: false, reason: `${raw} is no number.` };
  if (raw === "true" || raw === "false") return { ok: true, value: raw === "true" };
  if (Number.isFinite(number)) return { ok: true, value: number };
  return { ok: true, value: typeof unquoted === "string" ? unquoted : raw };
};
