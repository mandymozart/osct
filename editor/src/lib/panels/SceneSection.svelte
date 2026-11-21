<script lang="ts">
  import { untrack } from "svelte";
  import Section from "#lib/components/Section.svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { sceneName, targetsOf } from "#lib/scene-strip.js";
  import { errorText } from "#lib/api.js";
  import { selection } from "#lib/selection.svelte.js";
  import Icon from "#lib/components/Icon.svelte";
  import { sceneRemoval } from "#lib/scene-removal.svelte.js";
  import { arrangeSceneInRow, canArrangeInRow } from "#lib/surface-actions.js";

  /**
   * The open **scene** in the Inspector (#307 phase 3a, #319), above its own sections: its label (what the reader's
   * switcher and lists show), its group, its targets and *arrange in a row* for its surfaces. The surfaces themselves are
   * the Tree's (its Surfaces level: + adds one and selects it, the row's menu reorders and removes) and the selected
   * surface's Inspector (`SurfaceView`: label, size, place, reference image) – #337. Every field saves itself
   * (`PUT …/scenes/{id}`, RULES #37).
   */
  let { experienceId, sceneId }: { experienceId: string; sceneId: string } = $props();

  $effect(() => {
    const id = experienceId;
    if (scenes.experienceId !== id) void scenes.load(id);
  });

  const scene = $derived(scenes.scene(sceneId));
  /** What was typed, per scene – a save's answer never writes over it */
  let label = $state("");
  let shownFor: string | null = null;
  $effect(() => {
    const s = scene;
    if (!s || s.id === shownFor) return;
    shownFor = s.id;
    untrack(() => (label = s.label ?? ""));
  });

  let error = $state<string | null>(null);
  const put = async (body: Parameters<typeof scenes.putScene>[1] | (() => Promise<void>)) => {
    error = null;
    try {
      if (typeof body === "function") await body();
      else await scenes.putScene(sceneId, body);
    } catch (e) {
      error = errorText(e);
    }
  };
  const editLabel = (value: string) => {
    label = value;
    const id = sceneId;
    autosave.queue(`scene:${experienceId}:${id}:label`, async () => {
      if ((scenes.scene(id)?.label ?? "") !== value.trim()) await scenes.putScene(id, { label: value.trim() });
    });
  };
</script>

{#if scene}
  <Section id="stage.scene" label="scene" summary={sceneName(scene)}
    help="The open scene: its label and group, its targets, and arrange in a row for its surfaces – the physical areas it has (a double page, a cover, a wall), listed in the Tree, where + adds one and a click shows it in the Inspector. Every field saves itself.">
    <div class="row" data-help="What the reader's switcher and lists show for the scene – free text, never counted on (40–41, Cover, Studio wall). Empty: its id.">
      <span class="label">label</span>
      <input class="field" aria-label="Scene label" placeholder={scene.id} value={label} oninput={e => editLabel(e.currentTarget.value)} /></div>
    <div class="row" data-help="The group the scene belongs to – one stop of the reader's switcher, one loading window. Self: the scene is a stop of its own; the link icon shows the group.">
      <span class="label">group</span>
      <select class="field" aria-label="Scene group" value={scene.group ?? ""} onchange={e => void put({ group: e.currentTarget.value || null })}>
        <option value="">self</option>
        {#each scenes.groups as group (group.id)}<option value={group.id}>{group.label}</option>{/each}
      </select>
      {#if scene.group}<button type="button" class="icon-button group-link" onclick={() => selection.selectGroup(scene.group!)}
        title="Show the group in the Inspector" aria-label="Show the group"><Icon name="link" /></button>{/if}</div>
    <div class="row" data-help="The targets on this scene – the engine tracks at most 10 per scene (4 at the same moment).">
      <span class="label">targets</span>
      <span class="value">{targetsOf(scene)} of 10</span></div>
    <div class="row" data-help="Arrange in a row: the scene's surfaces flat on the table, side by side in their order, touching, the row centred on the origin – written to their places. Off while they lie so already.">
      <span class="label">surfaces</span>
      <button type="button" class="pill framed" disabled={!canArrangeInRow(sceneId)} onclick={() => void put(() => arrangeSceneInRow(sceneId))}
        title="The surfaces side by side, flat, touching, the row centred on the origin">arrange in a row</button></div>
    <div class="row" data-help="Removes the scene with its entries, their targets and AR content – first the Inspector shows what goes (and what other scenes still use), with the files only it uses; nothing is removed before you confirm. The opening scene cannot be removed.">
      <span class="label"></span>
      <button type="button" class="text-link danger" onclick={() => sceneRemoval.ask(sceneId)}>remove scene…</button></div>
    {#if error}<p class="small danger">{error}</p>{/if}
  </Section>
{/if}

<style>
  .value { min-width: 0; overflow-wrap: anywhere; }
  .group-link { flex: none; margin-left: .25rem; }
</style>
