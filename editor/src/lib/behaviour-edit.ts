import {
  BEHAVIOUR_CORE_EVENTS, BEHAVIOUR_TYPE, type BehaviourAction, type BehaviourRule, type BehaviourTest, type BehaviourValue, type BehaviourVerb,
  behaviourData, behaviourEvents, behaviourRules, behaviourVariables, componentProblems, type ComponentData, type EntityData,
} from "@engine/types";
import { namedPaths } from "@engine/scene/behaviour";
import { parseNumber } from "#lib/values.js";

/**
 * The Inspector's rule editor of a `behaviour` component (`shared/types/behaviour.ts`) – the
 * logic without the UI: the rules of a node's component, a copy with one piece changed, new rules, conditions and actions
 * with sensible defaults, values typed as text, and what the pickers offer (the subtree's node names, the book's
 * variables and events). The component is written back in the content's shortest form (`behaviourData`).
 */

/** The rules of the node's component at `index` (none when it is not a behaviour) */
export const rulesOf = (node: EntityData, index: number): BehaviourRule[] => {
  const component = node.components?.[index];
  return component?.type === BEHAVIOUR_TYPE ? behaviourRules(component) : [];
};

/** The node with the component at `index` holding `rules` */
export const withRules = (node: EntityData, index: number, rules: readonly BehaviourRule[]): EntityData => ({
  ...node,
  components: (node.components ?? []).map((component, i) => (i === index ? (behaviourData(rules) as ComponentData) : component)),
});

/** A copy of a list with the item at `index` replaced, or removed (`undefined`) */
export const replaceAt = <T>(list: readonly T[], index: number, item: T | undefined): T[] =>
  item === undefined ? list.filter((_, i) => i !== index) : list.map((current, i) => (i === index ? item : current));

/** A new rule: when the page is found, nothing yet – the author adds the actions */
export const newRule = (): BehaviourRule => ({ on: "found", when: null, do: [] });

/** A new condition test: the first variable offered (or none yet) equals true */
export const newTest = (variables: readonly string[] = []): BehaviourTest => ({ name: variables[0] ?? "", value: true, not: false });

/** A new action of a verb; `previous` hands over what both have (the node, a set's variable) when the verb changes */
export const newAction = (verb: BehaviourVerb, previous?: BehaviourAction, variables: readonly string[] = []): BehaviourAction => {
  const node = previous && "node" in previous ? previous.node : "";
  switch (verb) {
    case "play": return { action: "play", clip: "", node };
    case "pause": case "stop": case "show": case "hide": return { action: verb, node };
    case "set": return { action: "set", name: previous?.action === "set" ? previous.name : variables[0] ?? "", value: true, scope: "spread" };
    case "emit": return { action: "emit", event: "" };
  }
};

/** A rule with a test added, changed or removed; an empty condition is none */
export const withTest = (rule: BehaviourRule, index: number, test: BehaviourTest | undefined): BehaviourRule => {
  const tests = index >= (rule.when?.tests.length ?? 0) && test ? [...(rule.when?.tests ?? []), test] : replaceAt(rule.when?.tests ?? [], index, test);
  return { ...rule, when: tests.length ? { match: rule.when?.match ?? "all", tests } : null };
};

/** A rule with an action added (index past the end), changed or removed */
export const withAction = (rule: BehaviourRule, index: number, action: BehaviourAction | undefined): BehaviourRule => ({
  ...rule,
  do: index >= rule.do.length && action ? [...rule.do, action] : replaceAt(rule.do, index, action),
});

/**
 * A value typed as text: `true` / `false` → a boolean, a number (`parseNumber`, as in every number field) → a number,
 * empty → null (a condition: not set; a set: delete), anything else the text itself
 */
export const parseValue = (text: string): BehaviourValue | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed === "true" || trimmed === "false") return trimmed === "true";
  return parseNumber(trimmed) ?? text;
};

/** A value as its text field shows it (null = empty) */
export const formatValue = (value: BehaviourValue | null): string => (value === null ? "" : String(value));

/**
 * The names of the nodes under a node (itself included), in tree order, each once – what show, hide and play may name
 * (the engine's `namedPaths`: an action reaches the first node of a name)
 */
export const subtreeNames = (node: EntityData): string[] => [...namedPaths(node).keys()];

/** The path (relative to `node`) of the node a name stands for, as the engine finds it: empty = the node itself; null when no node has it */
export const pathOfName = (node: EntityData, name: string): number[] | null => {
  if (!name) return [];
  const path = namedPaths(node).get(name);
  if (path === undefined) return null;
  return path ? path.split(".").map(Number) : [];
};

/** Every node of a set of trees, depth first */
const allNodes = (trees: readonly EntityData[]): EntityData[] => trees.flatMap(tree => [tree, ...allNodes(tree.children ?? [])]);

/** Every behaviour rule of a set of trees */
const allRules = (trees: readonly EntityData[]): BehaviourRule[] =>
  allNodes(trees).flatMap(node => (node.components ?? []).filter(c => c.type === BEHAVIOUR_TYPE).flatMap(c => behaviourRules(c)));

/** The variables the book uses: its behaviours' (read and written) and the ones live on the stage (a plugin's too), sorted */
export const bookVariables = (trees: readonly EntityData[], live: readonly string[] = []): string[] =>
  [...new Set([...behaviourVariables(allRules(trees)), ...live])].sort();

/**
 * The events a rule may hear besides the node's own: the scene events the book's behaviours hear and emit, the ones seen
 * on the stage's timeline (a plugin's too), then the engine's core events
 */
export const bookEvents = (trees: readonly EntityData[], seen: readonly string[] = []): string[] => {
  const core = BEHAVIOUR_CORE_EVENTS as readonly string[];
  const scene = [...new Set([...behaviourEvents(allRules(trees)), ...seen])].filter(event => !core.includes(event) && event !== BEHAVIOUR_TYPE).sort();
  return [...scene, ...core];
};

/** What is wrong with a node's behaviour components – the panel shows it and keeps Save off until it is fixed */
export const behaviourIssues = (node: EntityData): string[] =>
  (node.components ?? []).flatMap((component, i) =>
    component.type === BEHAVIOUR_TYPE
      ? componentProblems([component], "behaviour").map(problem =>
        problem.replace(/^behaviour\[0\]\.rules\[(\d+)\]\.?/, (_, n: string) => `rule ${Number(n) + 1} – `).replace(/^behaviour\[0\]\.?/, `component ${i + 1} – `))
      : []);

/** The issues of every node of a tree (Save checks the whole tree) */
export const treeBehaviourIssues = (tree: EntityData): string[] => allNodes([tree]).flatMap(behaviourIssues);
