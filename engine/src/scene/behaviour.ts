import type { Object3D } from "three";
import {
  BEHAVIOUR_TYPE, type BehaviourAction, type ComponentData, type BehaviourCondition, type BehaviourRule, behaviourRules, describeActions, type EntityData,
  isBehaviourNodeEvent, type NodeTimeline, type Target,
} from "../types/index";
import { noteBehaviour, runtimeApi, type PluginVars } from "./plugin-runtime";

/**
 * The built-in `behaviour` component at runtime (grammar: `shared/types/behaviour.ts`): a node's
 * rules run on the plugin runtime's own mechanisms – the event bus and the variables (`plugin-runtime.ts`), as a
 * plugin's code would. The node's own events (`found`, `lost`, `tap`, `unlocked`) come from the entity's hooks, every
 * other event from the bus.
 *
 * Rules of an event: every rule's condition is read first, then the actions of the rules that matched run in their
 * order – so a rule cannot switch on a later rule of the same event (a toggle in two rules works). A rule's `emit` reaches
 * the bus at once; a chain of rules emitting events is cut off after `MAX_DEPTH` nested events (logged), so two rules that
 * emit each other's event cannot hang the scene. Every rule that fires is told to the editor's log (`noteBehaviour`),
 * never to the bus. An action that cannot run (a node or a clip not there, a write the runtime refuses) is logged and the
 * next one runs.
 */

/** How deep rules may set off rules through events before the chain is cut */
export const MAX_DEPTH = 8;
let depth = 0;

export interface BehaviourContext {
  node: EntityData;
  target: Target;
  /** The placement groups of the node's subtree by path relative to it (`""` = the node itself, `"1.0"`) */
  nodes: Record<string, Object3D>;
  /** The model timelines of the node's subtree by the same paths */
  timelines: Record<string, NodeTimeline>;
}

export interface BehaviourInstance {
  onFound(): void;
  onLost(): void;
  onTap(): void;
  onUnlocked(): void;
  dispose(): void;
  /** New rules in place (the editor's live edit); false when the node has no behaviour any more */
  tune(node: EntityData): boolean;
}

/** The node's behaviour component, or undefined */
export const behaviourOf = (node: EntityData): ComponentData | undefined =>
  node.components?.find(component => component.type === BEHAVIOUR_TYPE);

/** Whether a variable reader passes a rule's condition (none = always) */
export const passes = (when: BehaviourCondition | null, vars: Pick<PluginVars, "get">): boolean => {
  if (!when || !when.tests.length) return true;
  const results = when.tests.map(test => {
    const value = vars.get(test.name);
    const equal = test.value === null ? value === undefined : value === test.value;
    return test.not ? !equal : equal;
  });
  return when.match === "any" ? results.some(Boolean) : results.every(Boolean);
};

/** The paths of the named nodes of a subtree, relative to its root – the first node of a name wins */
export const namedPaths = (node: EntityData): Map<string, string> => {
  const paths = new Map<string, string>();
  const walk = (n: EntityData, path: string) => {
    const name = n.name?.trim();
    if (name && !paths.has(name)) paths.set(name, path);
    (n.children ?? []).forEach((child, i) => walk(child, path ? `${path}.${i}` : `${i}`));
  };
  walk(node, "");
  return paths;
};

/** The behaviour of a node (null when it carries none): its rules hear the node's hooks and the bus */
export const applyBehaviour = (context: BehaviourContext): BehaviourInstance | null => {
  const component = behaviourOf(context.node);
  if (!component) return null;
  const { target, nodes, timelines } = context;
  const api = runtimeApi(`${BEHAVIOUR_TYPE}:${target.id}`);
  let rules: BehaviourRule[] = [];
  let paths = new Map<string, string>();
  let ownName = "";
  let unsubscribe: Array<() => void> = [];
  const warned = new Set<string>();

  const warn = (message: string) => {
    if (warned.has(message)) return;
    warned.add(message);
    console.warn(`[behaviour] ${target.id}: ${message}`);
  };

  /** The path of a node named by an action: empty = the behaviour's own node */
  const pathOf = (name: string): string | undefined => {
    if (!name) return "";
    const path = paths.get(name);
    if (path === undefined) warn(`no node named "${name}" under ${ownName || "the behaviour's node"}`);
    return path;
  };

  const act = (action: BehaviourAction) => {
    switch (action.action) {
      case "play": case "pause": case "stop": {
        const path = pathOf(action.node);
        if (path === undefined) return;
        const timeline = timelines[path];
        if (!timeline) return warn(`${action.node || "the behaviour's node"} has no animation clip to ${action.action} (not a model with clips)`);
        if (action.action === "play") {
          if (action.clip && !timeline.clips.some(clip => clip.name === action.clip)) return warn(`no clip "${action.clip}" (${timeline.clips.map(c => c.name).join(", ")})`);
          timeline.play(action.clip || undefined);
        } else if (action.action === "pause") {
          timeline.pause();
        } else {
          timeline.seek(0);
          timeline.pause();
        }
        return;
      }
      case "show": case "hide": {
        const path = pathOf(action.node);
        const object = path === undefined ? undefined : nodes[path];
        if (object) object.visible = action.action === "show";
        return;
      }
      case "set":
        api.vars.set(action.name, action.value, action.scope);
        return;
      case "emit":
        api.events.emit(action.event, { targetId: target.id, ...(ownName ? { node: ownName } : {}) });
        return;
    }
  };

  const run = (event: string) => {
    const matched = rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.on === event && passes(rule.when, api.vars));
    if (!matched.length) return;
    if (depth >= MAX_DEPTH) return warn(`rules set off rules more than ${MAX_DEPTH} events deep – "${event}" stopped there`);
    depth++;
    try {
      matched.forEach(({ rule, index }) => {
        noteBehaviour({ targetId: target.id, ...(ownName ? { node: ownName } : {}), rule: index + 1, on: event, do: describeActions(rule.do) });
        rule.do.forEach(action => {
          try {
            act(action);
          } catch (error) {
            console.error(`[behaviour] ${target.id}: rule ${index + 1} (${event}) could not ${action.action}:`, error);
          }
        });
      });
    } finally {
      depth--;
    }
  };

  const listen = (node: EntityData) => {
    unsubscribe.forEach(off => off());
    rules = behaviourRules(behaviourOf(node));
    paths = namedPaths(node);
    ownName = node.name?.trim() ?? "";
    warned.clear();
    const events = [...new Set(rules.map(rule => rule.on).filter(event => !isBehaviourNodeEvent(event)))];
    unsubscribe = events.map(event => api.events.on(event, () => run(event)));
  };
  listen(context.node);

  return {
    onFound: () => run("found"),
    onLost: () => run("lost"),
    onTap: () => run("tap"),
    onUnlocked: () => run("unlocked"),
    dispose: () => {
      unsubscribe.forEach(off => off());
      unsubscribe = [];
    },
    tune: node => {
      if (!behaviourOf(node)) return false;
      listen(node);
      return true;
    },
  };
};
