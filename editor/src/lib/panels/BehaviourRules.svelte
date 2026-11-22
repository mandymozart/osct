<script lang="ts" module>
  /** A node a scene's or the experience's rule can name: its address and how the picker shows it */
  export interface NodeChoice {
    address: string;
    label: string;
  }
  /** A scene a goto can go to */
  export interface SceneChoice {
    id: string;
    label: string;
  }
</script>

<script lang="ts">
  import {
    BEHAVIOUR_ACTIONS, BEHAVIOUR_NODE_EVENTS, BEHAVIOUR_SCOPES, isBehaviourNodeEvent, sceneAddress, parseAddress,
    type BehaviourAction, type BehaviourRule, type BehaviourScope, type BehaviourVerb, type RuleHome, type VariableInfo,
  } from "@engine/types";
  import { newAction, newRule, replaceAt, setValueProblems, whenProblems, withAction } from "#lib/behaviour-edit.js";
  import ExpressionField from "#lib/components/ExpressionField.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * A list of rules as rows (#88, #334): a node's `behaviour` component, a scene's or the experience's `logic` (`home`) – no
   * JSON: per rule the event it listens to (a node's own as pressed pills – a node's rules only –, a named event typed with the
   * experience's events offered), its condition (**one expression**, `hasKey && tries > 2`, checked as you type: refused with
   * the reason while it does not parse, is ill-typed or is no true / false – B8) and its actions (a row per action: the verb
   * and what it takes – a clip, a node (a node's rules: by name in the subtree; a scene's or the experience's: by address,
   * `target:<id>/<name>`), a variable with its value (an expression, checked against the variable's type) and an optional
   * scope, an event, a scene to go to). The rule's type problems (`problemsOf`) show under it. Every change goes out as the
   * whole list (`onchange`); the owner writes it into its document.
   */
  let { rules, home = "entity", names = [], nodes = [], scenes = [], clipsOf = () => [], variables, events, types, problemsOf = () => [], uid, onchange }: {
    rules: BehaviourRule[];
    /** Where the rules live: a node's behaviour, a scene's logic, the experience's */
    home?: RuleHome;
    /** A node's rules: the named nodes of the behaviour's subtree */
    names?: string[];
    /** A scene's or the experience's rules: the nodes they can name, by address */
    nodes?: NodeChoice[];
    /** The scenes a goto can go to */
    scenes?: SceneChoice[];
    /** The clips of the model a node name (or address) stands for (empty = the behaviour's own node) */
    clipsOf?: (node: string) => string[];
    /** The variables the experience uses, for the name fields */
    variables: string[];
    /** The bus events a rule may listen to or emit */
    events: string[];
    /** The variables' types – declared, else inferred from their first set */
    types: ReadonlyMap<string, VariableInfo>;
    /** A rule's type problems in words (`typeProblemsByRule`) */
    problemsOf?: (rule: number) => string[];
    /** Unique per panel instance: the ids of the suggestion lists */
    uid: string;
    onchange: (rules: BehaviourRule[]) => void;
  } = $props();

  const own = $derived(home === "entity");
  const EVENT_KINDS = [...BEHAVIOUR_NODE_EVENTS, "event"] as const;
  type EventKind = (typeof EVENT_KINDS)[number];
  const EVENT_TITLES: Record<EventKind, string> = {
    found: "When the page is found", lost: "When the page is lost", tap: "When the reader taps the AR content",
    unlocked: "The page's first find", event: "A named event of the stage – a scene event of a plugin or a rule, or a core event",
  };
  const VERB_LABELS: Record<BehaviourVerb, string> = { play: "play", pause: "pause", stop: "stop", show: "show", hide: "hide", set: "set", emit: "emit", goto: "goto" };
  const typeOf = (name: string) => types.get(name)?.type;

  const update = (index: number, rule: BehaviourRule | undefined) => onchange(index >= rules.length && rule ? [...rules, rule] : replaceAt(rules, index, rule));
  const kindOf = (on: string): EventKind => (own && isBehaviourNodeEvent(on) ? on : "event");
  const setKind = (i: number, kind: EventKind) => update(i, { ...rules[i], on: kind === "event" ? (isBehaviourNodeEvent(rules[i].on) ? (events[0] ?? "") : rules[i].on) : kind });
  const setAction = (i: number, j: number, action: BehaviourAction | undefined) => update(i, withAction(rules[i], j, action));
  /** The clip choices of a play action: the model's clips, and the clip written in the content if the model lacks it */
  const clipChoices = (action: Extract<BehaviourAction, { action: "play" }>) => {
    const clips = clipsOf(action.node);
    return action.clip && !clips.includes(action.clip) ? [...clips, action.clip] : clips;
  };
  /** The scope a set without its own writes: the declared one, else the scene */
  const defaultScope = (name: string) => types.get(name)?.scope;
  const scopeLabel = (name: string) => (defaultScope(name) ? `declared (${defaultScope(name)})` : "scene (default)");
  const typeHint = (name: string) => {
    const info = types.get(name);
    return info ? `${info.type}${info.from.startsWith("experience.variables.") ? "" : " · inferred"}` : "untyped";
  };
  const gotoScene = (address: string) => {
    const parsed = parseAddress(address);
    return parsed?.scheme === "scene" ? parsed.id : "";
  };
</script>

<datalist id="{uid}-vars">{#each variables as name (name)}<option value={name}></option>{/each}</datalist>
<datalist id="{uid}-events">{#each events as name (name)}<option value={name}></option>{/each}</datalist>

{#snippet nodePicker(node: string, label: string, onpick: (node: string) => void)}
  <select class="field node" aria-label={label} value={node} onchange={e => onpick((e.currentTarget as HTMLSelectElement).value)}>
    {#if own}
      <option value="">this node</option>
      {#each names as name (name)}<option value={name}>{name}</option>{/each}
      {#if node && !names.includes(node)}<option value={node}>{node} (missing)</option>{/if}
    {:else}
      <option value="" disabled>pick a node</option>
      {#each nodes as choice (choice.address)}<option value={choice.address}>{choice.label}</option>{/each}
      {#if node && !nodes.some(c => c.address === node)}<option value={node}>{node} (missing)</option>{/if}
    {/if}
  </select>
{/snippet}

{#each rules as rule, i (i)}
  <div class="row top rule" data-help-name="Rule {i + 1}" data-help={own
    ? "What the rule reacts to: the page found or lost, a tap on the AR content, the page's first find (unlocked), or a named event on the stage – a scene event a plugin or another rule emits, or a core event like targetFound. The cross removes the rule."
    : "The event the rule listens to – an event of the stage: a scene event a plugin or another rule emits, or a core event like sceneChanged or targetUnlocked (a node's own found, lost, tap belong to the node's rules). The cross removes the rule."}>
    <span class="label strong">rule {i + 1}</span>
    <span class="controls line">
      <span class="args">
      {#if own}
        <Segmented options={EVENT_KINDS} value={kindOf(rule.on)} titles={EVENT_TITLES} onchange={kind => setKind(i, kind)} />
      {/if}
      {#if kindOf(rule.on) === "event"}
        <input class="field name" list="{uid}-events" aria-label="Event of rule {i + 1}" placeholder="event" spellcheck="false" value={rule.on}
          oninput={e => update(i, { ...rule, on: (e.currentTarget as HTMLInputElement).value.trim() })} />
      {/if}
      </span>
      <button type="button" class="icon-button end" aria-label="Remove rule {i + 1}" title="Remove rule {i + 1}" onclick={() => update(i, undefined)}><Icon name="close" /></button>
    </span>
  </div>

  <div class="row top" data-help-name="Condition" data-help="The rule runs only when this expression is true: variables, numbers, true / false, texts in quotes, compared with == != < <= > >= and joined with && || ! (hasKey && tries > 2, mood == &quot;calm&quot;). A variable is read like a plugin's api.vars.get, from the innermost scope that has it; one that is not set is false. Empty: the rule always runs. A condition that does not parse, is ill-typed or is no true / false is not saved – the reason shows under it.">
    <span class="label">when</span>
    <span class="controls">
      <ExpressionField value={rule.when} label="Condition of rule {i + 1}" placeholder="always" list="{uid}-vars"
        check={source => whenProblems(source, typeOf)} onchange={when => update(i, { ...rule, when })} />
    </span>
  </div>

  {#each rule.do as action, j (j)}
    <div class="row top" data-help-name="Action" data-help="What the rule does, in order: play, pause or stop a clip of a model (its own clip when none is chosen), show or hide a node, set a variable to an expression's value (tries + 1, true, &quot;calm&quot; – empty deletes it) in a scope (without one: the variable's declared scope, else the scene), emit a named event to the stage, go to another scene (goto). The cross removes the action.">
      <span class="label">{j === 0 ? "do" : "then"}</span>
      <span class="controls line">
        <span class="args">
        <select class="field verb" aria-label="Action {j + 1} of rule {i + 1}" value={action.action}
          onchange={e => setAction(i, j, newAction((e.currentTarget as HTMLSelectElement).value as BehaviourVerb, action, variables, typeOf))}>
          {#each BEHAVIOUR_ACTIONS as verb (verb)}<option value={verb}>{VERB_LABELS[verb]}</option>{/each}
        </select>
        {#if action.action === "play"}
          {@const clips = clipChoices(action)}
          <select class="field clip" aria-label="Clip" value={action.clip} onchange={e => setAction(i, j, { ...action, clip: (e.currentTarget as HTMLSelectElement).value })}>
            <option value="">its clip</option>
            {#each clips as clip (clip)}<option value={clip}>{clip}</option>{/each}
          </select>
          {@render nodePicker(action.node, "Node that plays", node => setAction(i, j, { ...action, node }))}
        {:else if action.action === "set"}
          <input class="field name" list="{uid}-vars" aria-label="Variable to set" placeholder="variable" spellcheck="false" value={action.name} title={typeHint(action.name)}
            oninput={e => setAction(i, j, { ...action, name: (e.currentTarget as HTMLInputElement).value.trim() })} />
          <span class="eq" aria-hidden="true">=</span>
          <ExpressionField value={action.value} label="Value to set" placeholder="delete" list="{uid}-vars"
            check={source => setValueProblems(source, action.name, typeOf)} onchange={value => setAction(i, j, { ...action, value })} />
          <select class="field scope" aria-label="Scope" value={action.scope ?? ""}
            onchange={e => { const scope = (e.currentTarget as HTMLSelectElement).value as BehaviourScope | ""; const { scope: _old, ...rest } = action; setAction(i, j, scope ? { ...rest, scope } : rest); }}>
            <option value="">{scopeLabel(action.name)}</option>
            {#each BEHAVIOUR_SCOPES as scope (scope)}<option value={scope}>{scope}</option>{/each}
          </select>
        {:else if action.action === "emit"}
          <input class="field name" list="{uid}-events" aria-label="Event to emit" placeholder="event" spellcheck="false" value={action.event}
            oninput={e => setAction(i, j, { ...action, event: (e.currentTarget as HTMLInputElement).value.trim() })} />
        {:else if action.action === "goto"}
          {@const scene = gotoScene(action.address)}
          <select class="field node" aria-label="Scene to go to" value={scene}
            onchange={e => setAction(i, j, { action: "goto", address: sceneAddress((e.currentTarget as HTMLSelectElement).value) })}>
            <option value="" disabled>pick a scene</option>
            {#each scenes as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
            {#if scene && !scenes.some(s => s.id === scene)}<option value={scene}>{scene} (missing)</option>{/if}
          </select>
        {:else}
          {@render nodePicker(action.node, `Node to ${action.action}`, node => setAction(i, j, { ...action, node }))}
        {/if}
        </span>
        <button type="button" class="icon-button" aria-label="Remove action {j + 1} of rule {i + 1}" title="Remove the action" onclick={() => setAction(i, j, undefined)}><Icon name="close" /></button>
      </span>
    </div>
  {/each}
  <div class="row" data-help-name="Action" data-help="Adds an action to the rule; the actions run in order.">
    <span class="label">{rule.do.length ? "" : "do"}</span>
    <span class="controls">
      <select class="field add" aria-label="Add an action to rule {i + 1}" value=""
        onchange={e => { const verb = (e.currentTarget as HTMLSelectElement).value as BehaviourVerb; (e.currentTarget as HTMLSelectElement).value = ""; if (verb) setAction(i, rule.do.length, newAction(verb, undefined, variables, typeOf)); }}>
        <option value="">+ action…</option>
        {#each BEHAVIOUR_ACTIONS as verb (verb)}<option value={verb}>{VERB_LABELS[verb]}</option>{/each}
      </select>
    </span>
  </div>
  {#each problemsOf(i) as problem (problem)}
    <div class="row"><span class="label"></span><span class="small danger problem">{problem}</span></div>
  {/each}
{/each}

<div class="row" data-help-name="Add rule" data-help="Adds a rule: an event, an optional condition, actions. On one event every rule's condition is read first, then the matching rules run in their order.">
  <span class="label">{rules.length ? "" : "rules"}</span>
  <span class="controls"><button type="button" class="pill framed" onclick={() => update(rules.length, newRule(home))}>+ rule</button></span>
</div>

<style>
  .rule { margin-top: .25rem; }
  .row > .strong { color: var(--text); }
  .end { margin-left: auto; }
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .line { flex-wrap: nowrap; align-items: flex-start; }
  .args { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: .25rem; align-items: flex-start; }
  .field { padding: 0 .375rem; }
  .verb { flex: none; width: 3.75rem; }
  .name { flex: 1 1 4rem; min-width: 3rem; }
  .eq { line-height: var(--control-height); color: var(--muted); }
  .clip, .node { flex: 1 1 4rem; min-width: 3rem; }
  .scope { flex: 1 1 4.25rem; min-width: 4rem; }
  .add { flex: none; width: auto; }
  .problem { overflow-wrap: anywhere; }
</style>
