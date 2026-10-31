<script lang="ts">
  import { BEHAVIOUR_ACTIONS, BEHAVIOUR_NODE_EVENTS, BEHAVIOUR_SCOPES, isBehaviourNodeEvent, type BehaviourAction, type BehaviourRule, type BehaviourScope, type BehaviourVerb } from "@engine/types";
  import { formatValue, newAction, newRule, newTest, parseValue, replaceAt, withAction, withTest } from "#lib/behaviour-edit.js";
  import Icon from "#lib/components/Icon.svelte";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * A `behaviour` component's rules as rows (#88) – no JSON: per rule the event it hears (the
   * node's own as pressed pills, a named event typed with the book's events offered), its condition (a row per test:
   * variable, equals or not, value; `and` / `or` between them) and its actions (a row per action: the verb and what it
   * takes – a clip of the node's model, a node of the subtree by name, a variable with value and scope, an event). Every
   * change goes out as the whole list (`onchange`); the panel writes it into the node.
   */
  let { rules, names, clipsOf, variables, events, uid, onchange }: {
    rules: BehaviourRule[];
    /** The named nodes of the behaviour's subtree */
    names: string[];
    /** The clips of the model a node name stands for (empty = the behaviour's own node) */
    clipsOf: (node: string) => string[];
    /** The variables the book uses, for the name fields */
    variables: string[];
    /** The bus events a rule may hear or emit */
    events: string[];
    /** Unique per panel instance: the ids of the suggestion lists */
    uid: string;
    onchange: (rules: BehaviourRule[]) => void;
  } = $props();

  const EVENT_KINDS = [...BEHAVIOUR_NODE_EVENTS, "event"] as const;
  type EventKind = (typeof EVENT_KINDS)[number];
  const EVENT_TITLES: Record<EventKind, string> = {
    found: "When the page is found", lost: "When the page is lost", tap: "When the reader taps the AR content",
    unlocked: "The page's first find", event: "A named event of the stage – a scene event of a plugin or a behaviour, or a core event",
  };
  const VERB_LABELS: Record<BehaviourVerb, string> = { play: "play", pause: "pause", stop: "stop", show: "show", hide: "hide", set: "set", emit: "emit" };

  const update = (index: number, rule: BehaviourRule | undefined) => onchange(index >= rules.length && rule ? [...rules, rule] : replaceAt(rules, index, rule));
  const kindOf = (on: string): EventKind => (isBehaviourNodeEvent(on) ? on : "event");
  const setKind = (i: number, kind: EventKind) => update(i, { ...rules[i], on: kind === "event" ? (isBehaviourNodeEvent(rules[i].on) ? (events[0] ?? "") : rules[i].on) : kind });
  const setAction = (i: number, j: number, action: BehaviourAction | undefined) => update(i, withAction(rules[i], j, action));
  /** The clip choices of a play action: the model's clips, and the clip written in the content if the model lacks it */
  const clipChoices = (action: Extract<BehaviourAction, { action: "play" }>) => {
    const clips = clipsOf(action.node);
    return action.clip && !clips.includes(action.clip) ? [...clips, action.clip] : clips;
  };
</script>

<datalist id="{uid}-vars">{#each variables as name (name)}<option value={name}></option>{/each}</datalist>
<datalist id="{uid}-events">{#each events as name (name)}<option value={name}></option>{/each}</datalist>
<datalist id="{uid}-values"><option value="true"></option><option value="false"></option></datalist>

{#snippet nodePicker(node: string, label: string, onpick: (node: string) => void)}
  <select class="field node" aria-label={label} value={node} onchange={e => onpick((e.currentTarget as HTMLSelectElement).value)}>
    <option value="">this node</option>
    {#each names as name (name)}<option value={name}>{name}</option>{/each}
    {#if node && !names.includes(node)}<option value={node}>{node} (missing)</option>{/if}
  </select>
{/snippet}

{#each rules as rule, i (i)}
  <div class="row top rule" data-help-name="Rule {i + 1}" data-help="What the rule reacts to: the page found or lost, a tap on the AR content, the page's first find (unlocked), or a named event on the stage – a scene event a plugin or another behaviour emits, or a core event like targetFound. The cross removes the rule.">
    <span class="label strong">rule {i + 1}</span>
    <span class="controls line">
      <span class="args">
      <Segmented options={EVENT_KINDS} value={kindOf(rule.on)} titles={EVENT_TITLES} onchange={kind => setKind(i, kind)} />
      {#if kindOf(rule.on) === "event"}
        <input class="field name" list="{uid}-events" aria-label="Event of rule {i + 1}" placeholder="event" spellcheck="false" value={rule.on}
          oninput={e => update(i, { ...rule, on: (e.currentTarget as HTMLInputElement).value.trim() })} />
      {/if}
      </span>
      <button type="button" class="icon-button end" aria-label="Remove rule {i + 1}" title="Remove rule {i + 1}" onclick={() => update(i, undefined)}><Icon name="close" /></button>
    </span>
  </div>

  {#each rule.when?.tests ?? [] as test, t (t)}
    <div class="row top" data-help-name="Condition" data-help="The rule runs only when the variable equals the value (=) or does not (≠) – read like a plugin's api.vars.get, from the innermost scope that has it. A value is true, false, a number or a text; empty means the variable is not set. With several conditions, all or any of them must hold.">
      <span class="label">{t === 0 ? "when" : rule.when?.match === "any" ? "or" : "and"}</span>
      <span class="controls line">
        <span class="args">
        <input class="field name" list="{uid}-vars" aria-label="Variable of condition {t + 1}, rule {i + 1}" placeholder="variable" spellcheck="false" value={test.name}
          oninput={e => update(i, withTest(rule, t, { ...test, name: (e.currentTarget as HTMLInputElement).value.trim() }))} />
        <Segmented options={["=", "≠"] as const} value={test.not ? "≠" : "="} titles={{ "=": "equals", "≠": "does not equal" }}
          onchange={op => update(i, withTest(rule, t, { ...test, not: op === "≠" }))} />
        <input class="field value" list="{uid}-values" aria-label="Value of condition {t + 1}, rule {i + 1}" placeholder="not set" spellcheck="false" value={formatValue(test.value)}
          onchange={e => update(i, withTest(rule, t, { ...test, value: parseValue((e.currentTarget as HTMLInputElement).value) }))} />
        </span>
        <button type="button" class="icon-button" aria-label="Remove condition {t + 1}" title="Remove the condition" onclick={() => update(i, withTest(rule, t, undefined))}><Icon name="close" /></button>
      </span>
    </div>
  {/each}
  <div class="row" data-help-name="Condition" data-help="Adds a condition on a variable – without one the rule always runs. With two or more: all of them must hold, or any one.">
    <span class="label">{rule.when?.tests.length ? "" : "when"}</span>
    <span class="controls">
      <button type="button" class="pill framed" onclick={() => update(i, withTest(rule, rule.when?.tests.length ?? 0, newTest(variables)))}>+ condition</button>
      {#if (rule.when?.tests.length ?? 0) > 1}
        <Segmented options={["all", "any"] as const} value={rule.when?.match ?? "all"} titles={{ all: "Every condition holds", any: "One of them holds" }}
          onchange={match => rule.when && update(i, { ...rule, when: { ...rule.when, match } })} />
      {/if}
    </span>
  </div>

  {#each rule.do as action, j (j)}
    <div class="row top" data-help-name="Action" data-help="What the rule does, in order: play, pause or stop a clip of a model (its own clip when none is chosen), show or hide a node (this node or one of its named children), set a variable in a scope (empty value deletes it), emit a named event to the stage. The cross removes the action.">
      <span class="label">{j === 0 ? "do" : "then"}</span>
      <span class="controls line">
        <span class="args">
        <select class="field verb" aria-label="Action {j + 1} of rule {i + 1}" value={action.action}
          onchange={e => setAction(i, j, newAction((e.currentTarget as HTMLSelectElement).value as BehaviourVerb, action, variables))}>
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
          <input class="field name" list="{uid}-vars" aria-label="Variable to set" placeholder="variable" spellcheck="false" value={action.name}
            oninput={e => setAction(i, j, { ...action, name: (e.currentTarget as HTMLInputElement).value.trim() })} />
          <input class="field value" list="{uid}-values" aria-label="Value to set" placeholder="delete" spellcheck="false" value={formatValue(action.value)}
            onchange={e => setAction(i, j, { ...action, value: parseValue((e.currentTarget as HTMLInputElement).value) })} />
          <select class="field scope" aria-label="Scope" value={action.scope} onchange={e => setAction(i, j, { ...action, scope: (e.currentTarget as HTMLSelectElement).value as BehaviourScope })}>
            {#each BEHAVIOUR_SCOPES as scope (scope)}<option value={scope}>{scope}</option>{/each}
          </select>
        {:else if action.action === "emit"}
          <input class="field name" list="{uid}-events" aria-label="Event to emit" placeholder="event" spellcheck="false" value={action.event}
            oninput={e => setAction(i, j, { ...action, event: (e.currentTarget as HTMLInputElement).value.trim() })} />
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
        onchange={e => { const verb = (e.currentTarget as HTMLSelectElement).value as BehaviourVerb; (e.currentTarget as HTMLSelectElement).value = ""; if (verb) setAction(i, rule.do.length, newAction(verb, undefined, variables)); }}>
        <option value="">+ action…</option>
        {#each BEHAVIOUR_ACTIONS as verb (verb)}<option value={verb}>{VERB_LABELS[verb]}</option>{/each}
      </select>
    </span>
  </div>
{/each}

<div class="row" data-help-name="Add rule" data-help="Adds a rule: an event, an optional condition, actions. On one event every rule's condition is read first, then the matching rules run in their order.">
  <span class="label">{rules.length ? "" : "rules"}</span>
  <span class="controls"><button type="button" class="pill framed" onclick={() => update(rules.length, newRule())}>+ rule</button></span>
</div>

<style>
  .rule { margin-top: .25rem; }
  .row > .strong { color: var(--text); }
  .end { margin-left: auto; }
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .line { flex-wrap: nowrap; align-items: flex-start; }
  .args { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: .25rem; }
  .field { padding: 0 .375rem; }
  .verb { flex: none; width: 3.75rem; }
  .name { flex: 1 1 4rem; min-width: 3rem; }
  .value { flex: 1 1 3rem; min-width: 2.75rem; }
  .clip, .node { flex: 1 1 4rem; min-width: 3rem; }
  .scope { flex: 1 1 4.25rem; min-width: 4rem; }
  .add { flex: none; width: auto; }
</style>
