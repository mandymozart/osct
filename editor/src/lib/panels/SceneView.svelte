<script lang="ts">
  import { content } from "#lib/content.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import Segmented from "#lib/components/Segmented.svelte";
  import Toggle from "#lib/components/Toggle.svelte";
  import Section from "#lib/components/Section.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { formatElapsed } from "#lib/stage/event-log.js";
  import { formatVar, initialValue, numberStep, tapTargets, VAR_TYPES, withTypes, type VarType } from "#lib/stage/narrative.js";
  import { VAR_SCOPES, type VarScope, type VarValue } from "@engine/scene/plugin-runtime";
  import PassesPanel from "./PassesPanel.svelte";
  import SceneSection from "./SceneSection.svelte";

  /**
   * The **scene** in the Inspector (#229 – the Stage tab's until then): what the Inspector shows while the scene is
   * selected – the tree's top row, a click on the stage that picks nothing, a fresh workspace. Collapsible sections
   * (open state kept per section): the **scene** (`SceneSection`: label, group, surfaces, arrange in a row), the scene's own
   * **post-processing** (an override of the experience's, #307 3c – the experience's passes and appearance are behind the
   * experience settings ⚙, `BookPanel`; the old "scene" section is gone: a double page is two surfaces), and the **narrative** of the book's plugins: a tap button per target (the
   * reader's tap without aiming), the variables with scope and type, editable and deletable, a form to set one by hand
   * (both written through the plugin API), *reset* for a new game, and the stage's event timeline (time since the
   * scene opened, event, payload) with *clear*. How the stage shows the scene – shake, origin, the desk's top, the
   * sky – is the toolbar's *view* group (`ViewMenu.svelte`), the grid its *grid & snap* group. The camera is moved on
   * the stage itself; found / lost per target is the tree's eye, the first find is replayed from the stage's menu.
   * Explanations are the controls' help in the Info view.
   */
  let { stage, bookId, sceneId, onenvironment }: {
    stage: Stage | null; bookId: string; sceneId: string;
    /** The environment row's link: the workspace opens the Environment tab */
    onenvironment?: () => void;
  } = $props();

  const scene = $derived(content.scene(sceneId));
  const vars = $derived(withTypes(stage?.vars ?? []));
  const events = $derived(stage?.events ?? []);
  /** A target takes a tap when it is found and shows AR content (the stage's live tree: an override, or the draft's) */
  const taps = $derived(tapTargets(scene?.entries ?? [], stage?.found ?? [], target => !!stage?.treeOf(target.id)));

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

<SceneSection {bookId} {sceneId} />

<!-- The scene's own post-processing, a child of its parameters; the experience's passes and appearance are behind the
     experience settings ⚙ (BookPanel) – #307 3c, Tilman -->
<PassesPanel {stage} {bookId} {sceneId} level="scene" />

{#snippet valueControl(type: VarType, value: VarValue, label: string, commit: (value: VarValue) => void)}
  {#if type === "boolean"}
    <Toggle on={value === true} {label} words={["false", "true"]} onchange={commit} />
  {:else if type === "number"}
    <span class="w"><ScrubNumber value={Number(value)} step={numberStep(Number(value))} {label} onchange={commit} /></span>
  {:else}
    <input class="field text" aria-label={label} value={formatVar(value)} onchange={e => commit((e.currentTarget as HTMLInputElement).value)} />
  {/if}
{/snippet}

<Section id="stage.narrative" label="vars and events" open={false} help="The narrative of the book's plugins on the stage: tap a target, set their variables by hand, read the stage's timeline.">
  <div class="row top" data-help="Taps a target's AR content without aiming at it, as a reader's tap would: the entity's onTap (a plugin component's, the animation's playOn: tap, a behaviour's tap rules) and the event targetTapped. Only a found target with AR content takes a tap.">
    <span class="label">tap</span>
    <span class="controls">
      {#each taps as t (t.id)}
        <button type="button" class="pill" disabled={!t.tappable} title={t.tappable ? `Tap ${t.label}` : `${t.label} is not found on the stage`} onclick={() => stage?.tap(t.id)}>{t.label}</button>
      {:else}
        <span class="small muted">none</span>
      {/each}
    </span></div>

  <div class="row" data-help="The plugins' api.vars, each with its scope and type. Reset starts a new game: every variable cleared, nothing unlocked, the timeline empty, the scene found anew.">
    <span class="label">vars</span>
    <span class="controls">
      {#if !vars.length}<span class="small muted">none</span>{/if}
      <button type="button" class="pill" onclick={() => stage?.resetNarrative()}>reset</button>
      {#if varError}<span class="small danger">{varError}</span>{/if}
    </span></div>
  {#each vars as v (v.scope + ":" + v.name)}
    <div class="row top" data-help-name="{v.scope} · {v.name}" data-help="A variable of the {v.scope} scope, a {v.type}. Change it to test a branch: it is written through the plugin API, so the plugins hear varChanged as from a plugin's set. The cross deletes it.">
      <span class="label var" title="{v.scope} · {v.name}">{v.name}</span>
      <span class="controls">
        <span class="small muted tag">{v.scope} · {v.type}</span>
        {@render valueControl(v.type, v.value, `${v.scope} ${v.name}`, value => write(v.name, value, v.scope))}
        <button type="button" class="icon-button" aria-label="Delete {v.name}" title="Delete {v.name}" onclick={() => write(v.name, null, v.scope)}><Icon name="close" /></button>
      </span></div>
  {/each}
  <div class="row top" data-help="Sets a variable by hand, as a plugin's api.vars.set(name, value, scope) would – a camelCase name, a scope and a value of a type. An existing variable of that name and scope takes the new value.">
    <span class="label">set</span>
    <span class="controls">
      <input class="field name" aria-label="Variable name" placeholder="name" bind:value={newName} />
      <select class="field" aria-label="Scope" bind:value={newScope}>
        {#each VAR_SCOPES as scope (scope)}<option value={scope}>{scope}</option>{/each}
      </select>
      <Segmented options={VAR_TYPES} value={newType} onchange={type => { newType = type; newValue = initialValue(type); }} />
      {@render valueControl(newType, newValue, "New value", value => (newValue = value))}
      <button type="button" class="pill" disabled={!newName.trim()} onclick={async () => { if (await write(newName.trim(), newValue, newScope)) newName = ""; }}>set</button>
    </span></div>

  <div class="row" data-help="The stage's events, newest first: the time since the scene opened, the event and its payload – found, lost, unlocked, tapped, sceneChanged, varChanged and the plugins' own; behaviour marks a rule of a behaviour component that ran (which target, the rule, its event and what it did) – the log's own line, not an event of the stage. Clear empties the list.">
    <span class="label">events</span>
    <span class="controls">
      <span class="small muted">{events.length || "none"}</span>
      <button type="button" class="text-link" disabled={!events.length} onclick={() => stage?.clearEvents()}>clear</button>
    </span></div>
  {#if events.length}
    <ol class="timeline" aria-label="Events">
      {#each events as e, i (i)}
        <li><span class="at muted">{formatElapsed(e.at)}</span><strong>{e.event}</strong>{#if e.detail}<span class="muted detail">{e.detail}</span>{/if}</li>
      {/each}
    </ol>
  {/if}
</Section>

<style>
  .w { width: 5rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .label.var { padding-left: 1rem; color: var(--text); }
  .tag { white-space: nowrap; }
  .name { width: 6rem; }
  .text { width: 8rem; }
  .timeline { flex-shrink: 0; list-style: none; margin: 0 0 .25rem; padding: 0; max-height: 12rem; overflow: auto; overflow-x: hidden; font-size: var(--text-small); }
  .timeline li { display: grid; grid-template-columns: 4.75rem auto minmax(0, 1fr); gap: .375rem; align-items: baseline; padding: .0625rem 0; }
  .at { font-variant-numeric: tabular-nums; text-align: right; }
  .detail { overflow-wrap: anywhere; }
</style>
