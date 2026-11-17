<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import Section from "#lib/components/Section.svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { selection } from "#lib/selection.svelte.js";
  import { groupScenes, runCounts, sceneName, sceneSpan, targetsOf } from "#lib/scene-strip.js";
  import { errorText } from "#lib/api.js";
  import { GROUP_WINDOW_TARGETS } from "@shared/api/editor";

  /**
   * A **group** of scenes in the Inspector (#307 phase 3a – a band of the Scenes panel clicked): its label (saved by
   * itself, `PUT …/groups/{id}`), its scenes, the reader's switcher stop it is, its targets against the loading window
   * (`GROUP_WINDOW_TARGETS`, a first guess until #300 measures it) and how the window goes through it – the whole group
   * at once or by order. The window is shown, not stored: the content has no field for it yet (`GroupData` = id and
   * label). Ungroup takes the group away; its scenes stay in place.
   */
  let { bookId, groupId }: { bookId: string; groupId: string } = $props();

  const group = $derived(scenes.group(groupId));
  const members = $derived(groupScenes(scenes.list, groupId));
  const counts = $derived(runCounts(members));
  /** What was typed – a save's answer never writes over it (RULES #37); another group starts from its own label */
  let label = $state(untrack(() => scenes.group(groupId)?.label ?? ""));
  let shownFor = untrack(() => groupId);
  $effect(() => {
    const id = groupId;
    const known = scenes.group(id)?.label;
    if (id !== shownFor) {
      shownFor = id;
      label = known ?? "";
    }
  });
  const edit = (value: string) => {
    label = value;
    const id = groupId;
    const subject = `group:${bookId}:${id}`;
    if (!value.trim()) return autosave.hold(subject, "A group needs a label.");
    autosave.queue(subject, async () => {
      if (scenes.group(id)?.label !== value.trim()) await scenes.renameGroup(id, value.trim());
    });
  };

  let error = $state<string | null>(null);
  const ungroup = async () => {
    error = null;
    try {
      await scenes.ungroup(groupId);
      selection.reset();
    } catch (e) {
      error = errorText(e);
    }
  };
  const share = $derived(Math.min(100, Math.round((counts.targets / GROUP_WINDOW_TARGETS) * 100)));
</script>

{#if !group}
  <p class="small muted">{scenes.tree ? "This group is gone." : "Loading the group…"}</p>
{:else}
  <Section id="group.group" label="group" summary={group.label}
    help="A group of scenes: one stop of the reader's bottom switcher and one loading window – every target of the group is made ready together.">
    <div class="row" data-help="The group's label: what the reader's switcher shows for its stop. Saved by itself.">
      <span class="label">label</span>
      <input class="field" aria-label="Group label" value={label} oninput={e => edit(e.currentTarget.value)} /></div>
    <div class="row" data-help="The scenes in the group, the first and the last.">
      <span class="label">scenes</span>
      <span class="value">{counts.scenes} · {sceneSpan(members.map(sceneName))}</span></div>
    <div class="row" data-help="The reader's bottom switcher steps through groups: this group is one stop.">
      <span class="label">switcher</span>
      <span class="value">one stop: “{group.label}”</span></div>
  </Section>

  <Section id="group.targets" label="targets" summary="{counts.targets} of {GROUP_WINDOW_TARGETS}"
    help="The group's targets against what the loading window holds at once.">
    <div class="row" data-help="All targets on the group's scenes.">
      <span class="label">in the group</span>
      <span class="value" class:warn={counts.over}>{counts.targets} of {GROUP_WINDOW_TARGETS}</span></div>
    <div class="meter" aria-hidden="true"><i style:width="{share}%" class:warn={counts.over}></i></div>
    {#if counts.over}
      <p class="note small muted">More than the loading window holds at once (a first guess – measured on the phone with #300). The window moves through the group by order – the reader may wait at a scene change.</p>
    {/if}
    <div class="row" data-help="How the loading window goes through the group: all of it at once while it fits, else by order. Shown only – the content has no setting for it yet.">
      <span class="label">window</span>
      <span class="value">{counts.over ? "by order" : "whole group"} <span class="muted">· not a setting yet</span></span></div>
  </Section>

  <Section id="group.scenes" label="scenes in the group" summary={String(counts.scenes)}
    help="The group's scenes in order with their targets – a click opens one.">
    {#each members as scene (scene.id)}
      <div class="row">
        <button type="button" class="text-link label scene" onclick={() => void goto(resolve(`${bookId}/${scene.id}/`))}>{sceneName(scene)}</button>
        <span class="value">{targetsOf(scene)} targets</span></div>
    {/each}
    <div class="row">
      <span class="label"></span>
      <span class="controls">
        <button type="button" class="pill" onclick={() => void ungroup()} data-help-name="Ungroup"
          data-help="The group goes; its scenes stay in place and in order, each its own stop again (Ctrl+Shift+G in the Scenes panel).">Ungroup</button>
        {#if error}<span class="small danger">{error}</span>{/if}
      </span></div>
  </Section>
{/if}

<style>
  .value { min-width: 0; overflow-wrap: anywhere; }
  .warn { color: var(--warn); }
  .meter { position: relative; height: .35rem; margin: .125rem 0 .25rem; background: var(--control-background); }
  .meter i { position: absolute; inset: 0 auto 0 0; background: var(--accent); }
  .meter i.warn { background: var(--warn); }
  .note { margin: 0 0 .25rem; }
  .scene { text-align: left; color: var(--text); }
</style>
