/**
 * The built-in `behaviour` component (content schema 2.19): a node's rules without code. Each rule names an event it
 * reacts to (`on`), optionally a condition on variables (`when`), and the actions it then runs (`do`):
 *
 *   components:
 *     - type: behaviour
 *       rules:
 *         - on: tap
 *           do:
 *             - play: rattle
 *             - set: { hasKey: true }
 *               scope: book
 *             - emit: keyRattled
 *         - on: found
 *           when: { hasKey: true }
 *           do: { hide: hint }
 *
 * **Events**: the node's own `found`, `lost`, `tap` and `unlocked` (the target's first find), or any other name – an
 * event of the engine's bus (a scene event a plugin or another behaviour emits, or a core event such as `targetFound`).
 * **Conditions**: every variable named equals its value (`{ hasKey: true }`), or with `any:` one of them does
 * (`{ any: { hasKey: true, tries: 3 } }`); `{ not: value }` turns a test round and `null` stands for a variable that is
 * not set. A variable is read like a plugin's `api.vars.get(name)` – the innermost scope that has it.
 * **Actions**: `play: <clip>` (empty = the node's own clip – its `animation` component's, else the first), `pause` and
 * `stop` a clip, `show` and `hide` a node, `set: { name: value }` with an optional `scope` (spread by default; `null`
 * deletes), `emit: <event>` (a scene event – never a core event). The node of `play` (its `node`), of `pause`, `stop`,
 * `show` and `hide` (their value) is the behaviour's own node when empty, else the node of that `name` in its subtree.
 * A shorthand string runs a verb on the own node: `play`, `pause`, `stop`, `show`, `hide`.
 *
 * Every definition lives here – the content build, the guard, the engine (`engine/src/scene/behaviour.ts`), the editor's
 * rule editor and the MCP server read one grammar. `behaviourRules` reads the content into the rules the code works
 * with; `behaviourData` writes rules back in the content's shortest form.
 */

import { CAMEL_CASE_NAME, isObject } from "../guards/primitives";

/** The component's type */
export const BEHAVIOUR_TYPE = "behaviour";

/** The node's own events: the target found, lost, tapped, unlocked (its first find) */
export const BEHAVIOUR_NODE_EVENTS = ["found", "lost", "tap", "unlocked"] as const;
export type BehaviourNodeEvent = (typeof BEHAVIOUR_NODE_EVENTS)[number];

/** What a rule can do */
export const BEHAVIOUR_ACTIONS = ["play", "pause", "stop", "show", "hide", "set", "emit"] as const;
export type BehaviourVerb = (typeof BEHAVIOUR_ACTIONS)[number];

/** The verbs that act on a node (the own node when its name is empty) – also the shorthands, a verb alone as a string */
export const BEHAVIOUR_NODE_ACTIONS = ["play", "pause", "stop", "show", "hide"] as const;

/** The variable scopes – the engine's runtime uses them as its own (`engine/src/scene/plugin-runtime.ts` `VAR_SCOPES`) */
export const BEHAVIOUR_SCOPES = ["spread", "stage", "session", "book"] as const;
export type BehaviourScope = (typeof BEHAVIOUR_SCOPES)[number];

/** The engine's core events: heard by a rule, never emitted (the runtime's `CORE_EVENTS` are these) */
export const BEHAVIOUR_CORE_EVENTS = ["targetFound", "targetLost", "targetUnlocked", "targetTapped", "spreadChanged", "sceneState", "varChanged"] as const;

/** A variable's or an event's name: camelCase letters and digits (the runtime's `EVENT_NAME_PATTERN` is this one) */
export const BEHAVIOUR_NAME_PATTERN = CAMEL_CASE_NAME;

/** A condition's keys that are not variables */
const CONDITION_WORDS = ["any", "not"];

/** A variable's value: a JSON scalar; `null` in a condition = not set, in a `set` = delete */
export type BehaviourValue = string | number | boolean;

export interface BehaviourTest {
  name: string;
  value: BehaviourValue | null;
  /** The test passes when the variable does not equal the value */
  not: boolean;
}

export interface BehaviourCondition {
  /** `all`: every test passes; `any`: one does */
  match: "all" | "any";
  tests: BehaviourTest[];
}

export type BehaviourAction =
  | { action: "play"; clip: string; node: string }
  | { action: "pause" | "stop" | "show" | "hide"; node: string }
  | { action: "set"; name: string; value: BehaviourValue | null; scope: BehaviourScope }
  | { action: "emit"; event: string };

export interface BehaviourRule {
  on: string;
  /** null = always */
  when: BehaviourCondition | null;
  do: BehaviourAction[];
}

export const isBehaviourNodeEvent = (event: string): event is BehaviourNodeEvent => (BEHAVIOUR_NODE_EVENTS as readonly string[]).includes(event);

const isCoreEvent = (event: string) => (BEHAVIOUR_CORE_EVENTS as readonly string[]).includes(event);

const isScalar = (value: unknown): value is BehaviourValue =>
  typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

const show = (value: unknown) => JSON.stringify(value);

// ── Checking the content ──────────────────────────────────────────────────────────────────────

/** Problems of a behaviour component's fields (all but `type`) – the content build and the guard (`componentProblems`) */
export const behaviourProblems = (params: Record<string, unknown>, at: string): string[] => {
  const problems: string[] = [];
  Object.keys(params).filter(name => name !== "rules").forEach(name => problems.push(`${at}.${name}: unknown field of behaviour (rules)`));
  const rules = params.rules;
  if (rules === undefined) return problems;
  if (!Array.isArray(rules)) return [...problems, `${at}.rules: expected a list of rules { on, when?, do }`];
  rules.forEach((rule, i) => problems.push(...ruleProblems(rule, `${at}.rules[${i}]`)));
  return problems;
};

const ruleProblems = (rule: unknown, at: string): string[] => {
  if (!isObject(rule)) return [`${at}: expected a rule { on, when?, do }`];
  const problems: string[] = [];
  Object.keys(rule).filter(key => !["on", "when", "do"].includes(key)).forEach(key => problems.push(`${at}.${key}: unknown field of a rule (on, when, do)`));
  if (typeof rule.on !== "string" || !BEHAVIOUR_NAME_PATTERN.test(rule.on)) {
    problems.push(`${at}.on: expected an event – ${BEHAVIOUR_NODE_EVENTS.join(", ")} or an event's name (camelCase), got ${show(rule.on)}`);
  }
  if (rule.when !== undefined) problems.push(...conditionProblems(rule.when, `${at}.when`));
  if (rule.do === undefined) problems.push(`${at}.do: a rule needs an action or a list of actions`);
  else if (Array.isArray(rule.do)) rule.do.forEach((action, i) => problems.push(...actionProblems(action, `${at}.do[${i}]`)));
  else problems.push(...actionProblems(rule.do, `${at}.do`));
  return problems;
};

const conditionProblems = (when: unknown, at: string): string[] => {
  if (!isObject(when)) return [`${at}: expected { variable: value, … } or { any: { variable: value, … } }`];
  if ("any" in when) {
    if (Object.keys(when).length > 1) return [`${at}: any stands alone – { any: { variable: value, … } }`];
    if (!isObject(when.any)) return [`${at}.any: expected { variable: value, … }`];
    return testsProblems(when.any, `${at}.any`);
  }
  return testsProblems(when, at);
};

const testsProblems = (tests: Record<string, unknown>, at: string): string[] =>
  Object.entries(tests).flatMap(([name, value]) => {
    const problems: string[] = [];
    if (!BEHAVIOUR_NAME_PATTERN.test(name) || CONDITION_WORDS.includes(name)) problems.push(`${at}.${name}: not a variable name (camelCase letters and digits)`);
    const tested = isObject(value) && "not" in value && Object.keys(value).length === 1 ? value.not : value;
    if (tested !== null && !isScalar(tested)) problems.push(`${at}.${name}: expected a value (text, number, true / false, null = not set) or { not: value }, got ${show(value)}`);
    return problems;
  });

const actionProblems = (action: unknown, at: string): string[] => {
  if (typeof action === "string") {
    return (BEHAVIOUR_NODE_ACTIONS as readonly string[]).includes(action) ? [] : [`${at}: expected an action – ${BEHAVIOUR_NODE_ACTIONS.join(", ")} or { play | pause | stop | show | hide | set | emit: … }, got ${show(action)}`];
  }
  if (!isObject(action)) return [`${at}: expected an action { play | pause | stop | show | hide | set | emit: … }`];
  const verbs = Object.keys(action).filter(key => (BEHAVIOUR_ACTIONS as readonly string[]).includes(key));
  if (verbs.length !== 1) return [`${at}: an action has one of ${BEHAVIOUR_ACTIONS.join(", ")}, got ${verbs.length ? verbs.join(" and ") : "none"}`];
  const verb = verbs[0] as BehaviourVerb;
  const value = action[verb];
  const options = verb === "play" ? ["node"] : verb === "set" ? ["scope"] : [];
  const problems = Object.keys(action).filter(key => key !== verb && !options.includes(key))
    .map(key => `${at}.${key}: unknown field of ${verb}${options.length ? ` (${options.join(", ")})` : ""}`);
  const nodeName = (name: unknown, where: string) => {
    if (name !== undefined && typeof name !== "string") problems.push(`${where}: expected a node's name (empty = the behaviour's own node), got ${show(name)}`);
  };
  switch (verb) {
    case "play":
      if (typeof value !== "string") problems.push(`${at}.play: expected a clip's name (empty = the node's own clip), got ${show(value)}`);
      nodeName(action.node, `${at}.node`);
      break;
    case "pause": case "stop": case "show": case "hide":
      nodeName(value === true ? undefined : value, `${at}.${verb}`);
      break;
    case "set":
      if (!isObject(value) || !Object.keys(value).length) {
        problems.push(`${at}.set: expected { variable: value, … }`);
      } else {
        Object.entries(value).forEach(([name, v]) => {
          if (!BEHAVIOUR_NAME_PATTERN.test(name)) problems.push(`${at}.set.${name}: not a variable name (camelCase letters and digits)`);
          if (v !== null && !isScalar(v)) problems.push(`${at}.set.${name}: expected a text, a number, true / false or null (deletes), got ${show(v)}`);
        });
      }
      if (action.scope !== undefined && !(BEHAVIOUR_SCOPES as readonly string[]).includes(action.scope as string)) {
        problems.push(`${at}.scope: expected one of ${BEHAVIOUR_SCOPES.join(", ")}, got ${show(action.scope)}`);
      }
      break;
    case "emit":
      if (typeof value !== "string" || !BEHAVIOUR_NAME_PATTERN.test(value)) problems.push(`${at}.emit: expected an event's name (camelCase letters and digits), got ${show(value)}`);
      else if (isCoreEvent(value) || isBehaviourNodeEvent(value)) problems.push(`${at}.emit: ${value} is the engine's own event – a rule hears it, never emits it`);
      break;
  }
  return problems;
};

// ── Reading and writing ─────────────────────────────────────────────────────────────────────────

/** The rules of a behaviour component as the code works with them (a piece that does not check out is left out) */
export const behaviourRules = (component: Readonly<Record<string, unknown>> | undefined): BehaviourRule[] => {
  const rules = component?.rules;
  if (!Array.isArray(rules)) return [];
  return rules.flatMap(rule => {
    if (!isObject(rule) || typeof rule.on !== "string") return [];
    const actions = (Array.isArray(rule.do) ? rule.do : rule.do === undefined ? [] : [rule.do]).flatMap(readAction);
    return [{ on: rule.on, when: readCondition(rule.when), do: actions }];
  });
};

const readCondition = (when: unknown): BehaviourCondition | null => {
  if (!isObject(when)) return null;
  const any = "any" in when && isObject(when.any);
  const tests = Object.entries(any ? (when.any as Record<string, unknown>) : when).flatMap(([name, raw]): BehaviourTest[] => {
    if (CONDITION_WORDS.includes(name)) return [];
    const negated = isObject(raw) && "not" in raw;
    const value = negated ? (raw as { not: unknown }).not : raw;
    return value === null || isScalar(value) ? [{ name, value, not: negated }] : [];
  });
  return tests.length ? { match: any ? "any" : "all", tests } : null;
};

const readAction = (raw: unknown): BehaviourAction[] => {
  if (typeof raw === "string") {
    if (raw === "play") return [{ action: "play", clip: "", node: "" }];
    if (raw === "pause" || raw === "stop" || raw === "show" || raw === "hide") return [{ action: raw, node: "" }];
    return [];
  }
  if (!isObject(raw)) return [];
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  if ("play" in raw) return [{ action: "play", clip: text(raw.play), node: text(raw.node) }];
  for (const verb of ["pause", "stop", "show", "hide"] as const) {
    if (verb in raw) return [{ action: verb, node: text(raw[verb]) }];
  }
  if ("set" in raw && isObject(raw.set)) {
    const scope = (BEHAVIOUR_SCOPES as readonly string[]).includes(raw.scope as string) ? (raw.scope as BehaviourScope) : "spread";
    return Object.entries(raw.set).flatMap(([name, value]): BehaviourAction[] =>
      value === null || isScalar(value) ? [{ action: "set", name, value, scope }] : []);
  }
  if ("emit" in raw && typeof raw.emit === "string") return [{ action: "emit", event: raw.emit }];
  return [];
};

/** A behaviour component in the content's shortest form – what the editor saves */
export const behaviourData = (rules: readonly BehaviourRule[]): { type: typeof BEHAVIOUR_TYPE; rules: Record<string, unknown>[] } => ({
  type: BEHAVIOUR_TYPE,
  rules: rules.map(rule => {
    const actions = rule.do.map(writeAction);
    return {
      on: rule.on,
      ...(rule.when && rule.when.tests.length ? { when: writeCondition(rule.when) } : {}),
      do: actions.length === 1 ? actions[0] : actions,
    };
  }),
});

const writeCondition = (when: BehaviourCondition): Record<string, unknown> => {
  const tests = Object.fromEntries(when.tests.map(test => [test.name, test.not ? { not: test.value } : test.value]));
  return when.match === "any" && when.tests.length > 1 ? { any: tests } : tests;
};

const writeAction = (action: BehaviourAction): unknown => {
  switch (action.action) {
    case "play":
      if (!action.clip && !action.node) return "play";
      return { play: action.clip, ...(action.node ? { node: action.node } : {}) };
    case "pause": case "stop": case "show": case "hide":
      return action.node ? { [action.action]: action.node } : action.action;
    case "set":
      return { set: { [action.name]: action.value }, ...(action.scope !== "spread" ? { scope: action.scope } : {}) };
    case "emit":
      return { emit: action.event };
  }
};

/** The variables a set of rules reads and writes, sorted (the editor offers them) */
export const behaviourVariables = (rules: readonly BehaviourRule[]): string[] =>
  [...new Set(rules.flatMap(rule => [
    ...(rule.when?.tests.map(test => test.name) ?? []),
    ...rule.do.flatMap(action => (action.action === "set" ? [action.name] : [])),
  ]))].sort();

/** The bus events a set of rules hears and emits, sorted (the node's own events left out) */
export const behaviourEvents = (rules: readonly BehaviourRule[]): string[] =>
  [...new Set(rules.flatMap(rule => [
    ...(isBehaviourNodeEvent(rule.on) ? [] : [rule.on]),
    ...rule.do.flatMap(action => (action.action === "emit" ? [action.event] : [])),
  ]))].sort();

/** A rule's actions in words for a log line: `play rattle · set hasKey = true (book) · emit keyRattled` */
export const describeActions = (actions: readonly BehaviourAction[]): string =>
  actions.map(action => {
    switch (action.action) {
      case "play": return `play ${action.clip || "its clip"}${action.node ? ` on ${action.node}` : ""}`;
      case "pause": case "stop": case "show": case "hide": return `${action.action}${action.node ? ` ${action.node}` : ""}`;
      case "set": return `set ${action.name} = ${action.value === null ? "unset" : JSON.stringify(action.value)}${action.scope !== "spread" ? ` (${action.scope})` : ""}`;
      case "emit": return `emit ${action.event}`;
    }
  }).join(" · ");
