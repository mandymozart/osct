<script lang="ts">
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import Segmented from "#lib/components/Segmented.svelte";
  import Toggle from "#lib/components/Toggle.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Section from "#lib/components/Section.svelte";
  import { listSummary } from "#lib/stage/log-entries.js";
  import { formatVar, initialValue, numberStep, VAR_TYPES, withTypes, type VarType } from "#lib/stage/narrative.js";
  import { VAR_SCOPES, type VarScope, type VarValue } from "@engine/scene/plugin-runtime";

  /**
   * The **Variables** tab (#337): the plugins' live variables on the stage, each with its scope and type, a control for
   * its value and a delete; a form to set one by hand (both written through the plugin API in the stage frame, so the
   * plugins hear `varChanged` as from a plugin's set); *reset* for a new game. The experience's declared variables
   * (name, type, default) are the experience's Inspector's (`VariablesEditor`) – these are the values while it plays.
   * Each scope is a section of its own (its count and first names when closed): the scene's open at first, the others
   * and *set* closed, so a long list stays easy to walk.
   */
  let { stage }: { stage: Stage | null } = $props();

  const vars = $derived(withTypes(stage?.vars ?? []));

  let varError = $state<string | null>(null);
  let newName = $state("");
  let newScope = $state<VarScope>("scene");
  let newType = $state<VarType>("boolean");
  let newValue = $state<VarValue>(initialValue("boolean"));
  /** Write a variable through the plugin API in the stage frame (null deletes); true when it was written */
  const write = async (name: string, value: VarValue | null, scope: VarScope): Promise<boolean> => {
    varError = stage ? await stage.setVar(name, value, scope) : "the stage is not running";
    return varError === null;
  };
</script>

{#snippet valueControl(type: VarType, value: VarValue, label: string, commit: (value: VarValue) => void)}
  {#if type === "boolean"}
    <Toggle on={value === true} {label} words={["false", "true"]} onchange={commit} />
  {:else if type === "number"}
    <span class="w"><ScrubNumber value={Number(value)} step={numberStep(Number(value))} {label} onchange={commit} /></span>
  {:else}
    <input class="field text" aria-label={label} value={formatVar(value)} onchange={e => commit((e.currentTarget as HTMLInputElement).value)} />
  {/if}
{/snippet}

<div class="row" data-help="The plugins' api.vars on the stage, each with its scope and type. Reset starts a new game: every variable cleared, nothing unlocked, the timeline empty, the scene found anew.">
  <span class="label">vars</span>
  <span class="controls">
    <span class="small muted">{vars.length || "none"}</span>
    <button type="button" class="pill" disabled={!stage} onclick={() => stage?.resetNarrative()}>reset</button>
    {#if varError}<span class="small danger">{varError}</span>{/if}
  </span></div>
{#each VAR_SCOPES as scope (scope)}
  {@const list = vars.filter(v => v.scope === scope)}
  <Section id="variables.{scope}" label={scope} open={scope === "scene"} summary={listSummary(list.map(v => v.name))}
    help="The variables of the {scope} scope on the stage, each with its type, its value to change and a cross that deletes it.">
    {#each list as v (v.name)}
      <div class="row top" data-help-name="{v.scope} · {v.name}" data-help="A variable of the {v.scope} scope, a {v.type}. Change it to test a branch: it is written through the plugin API, so the plugins hear varChanged as from a plugin's set. The cross deletes it.">
        <span class="label var" title="{v.scope} · {v.name}">{v.name}</span>
        <span class="controls">
          <span class="small muted tag">{v.type}</span>
          {@render valueControl(v.type, v.value, `${v.scope} ${v.name}`, value => write(v.name, value, v.scope))}
          <button type="button" class="icon-button" aria-label="Delete {v.name}" title="Delete {v.name}" onclick={() => write(v.name, null, v.scope)}><Icon name="close" /></button>
        </span></div>
    {:else}
      <p class="small muted">No {scope} variables.</p>
    {/each}
  </Section>
{/each}
<Section id="variables.set" label="set" open={false} summary="a variable by hand"
  help="Sets a variable by hand, as a plugin's api.vars.set(name, value, scope) would – a camelCase name, a scope and a value of a type. An existing variable of that name and scope takes the new value.">
  <div class="row top" data-help="Sets a variable by hand, as a plugin's api.vars.set(name, value, scope) would – a camelCase name, a scope and a value of a type. An existing variable of that name and scope takes the new value.">
    <span class="label">set</span>
    <span class="controls">
      <input class="field name" aria-label="Variable name" placeholder="name" bind:value={newName} />
      <select class="field" aria-label="Scope" bind:value={newScope}>
        {#each VAR_SCOPES as scope (scope)}<option value={scope}>{scope}</option>{/each}
      </select>
      <Segmented options={VAR_TYPES} value={newType} onchange={type => { newType = type; newValue = initialValue(type); }} />
      {@render valueControl(newType, newValue, "New value", value => (newValue = value))}
      <button type="button" class="pill" disabled={!newName.trim() || !stage} onclick={async () => { if (await write(newName.trim(), newValue, newScope)) newName = ""; }}>set</button>
    </span></div>
</Section>

<style>
  .w { width: 5rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .label.var { color: var(--text); }
  .tag { white-space: nowrap; }
  .name { width: 6rem; }
  .text { width: 8rem; }
</style>
