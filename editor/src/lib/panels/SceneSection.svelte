<script lang="ts">
  import { untrack } from "svelte";
  import Section from "#lib/components/Section.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { sceneName, targetsOf } from "#lib/scene-strip.js";
  import { errorText } from "#lib/api.js";
  import { selection } from "#lib/selection.svelte.js";
  import Icon from "#lib/components/Icon.svelte";
  import { DEFAULT_PAGE_MM } from "#lib/stage/stage-layout.js";
  import { SCENE_LAYOUTS, type SceneLayout } from "@shared/types/game-config";
  import SurfaceList from "./SurfaceList.svelte";

  /**
   * The open **scene** in the Inspector (#307 phase 3a), above the spread's own sections: its label (what the reader's
   * switcher and lists show), its layout (fixed – printed together – or free), its group, its targets, and its
   * **surfaces** (#314, `SurfaceList`): each with its label as printed (editable), side and size; add a page, a wall or a
   * custom one, reorder, remove; a click on one selects it – the Inspector shows its size, place and reference image (the
   * same edits as the Tree's Surfaces level and the Surface mode). Every field saves itself (`PUT …/scenes/{id}`, RULES #37).
   */
  let { bookId, spreadId, page = DEFAULT_PAGE_MM }: { bookId: string; spreadId: string; page?: { width: number; height: number } } = $props();

  $effect(() => {
    const id = bookId;
    if (scenes.bookId !== id) void scenes.load(id);
  });

  const scene = $derived(scenes.scene(spreadId));
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
  const put = async (body: Parameters<typeof scenes.putScene>[1]) => {
    error = null;
    try {
      await scenes.putScene(spreadId, body);
    } catch (e) {
      error = errorText(e);
    }
  };
  const editLabel = (value: string) => {
    label = value;
    const id = spreadId;
    autosave.queue(`scene:${bookId}:${id}:label`, async () => {
      if ((scenes.scene(id)?.label ?? "") !== value.trim()) await scenes.putScene(id, { label: value.trim() || null });
    });
  };
  const LAYOUT_TITLES: Record<SceneLayout, string> = {
    fixed: "Fixed: the surfaces side by side as printed together – a double page, a fold-out",
    free: "Free: each surface on its own anchor – a page and a wall, a room",
  };
</script>

{#if scene}
  <Section id="stage.scene" label="scene" summary={sceneName(scene)}
    help="The open scene: its label, layout and group, and its surfaces – the physical areas it has (pages, a cover, a wall), each with its size and its label as printed. Every field saves itself.">
    <div class="row" data-help="What the reader's switcher and lists show for the scene – free text, never counted on (Pages 40–41, Studio wall). Empty: its pages.">
      <span class="label">label</span>
      <input class="field" aria-label="Scene label" placeholder={sceneName({ ...scene, label: undefined })} value={label} oninput={e => editLabel(e.currentTarget.value)} /></div>
    <div class="row" data-help="How the surfaces relate: fixed – printed together, side by side; free – each on its own anchor.">
      <span class="label">layout</span>
      <Segmented options={SCENE_LAYOUTS} value={scene.layout ?? "fixed"} label="Scene layout" titles={LAYOUT_TITLES}
        onchange={layout => void put({ layout: layout === "fixed" ? null : layout })} /></div>
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
    {#if error}<p class="small danger">{error}</p>{/if}
  </Section>

  <Section id="stage.surfaces" label="surfaces" summary={String(scene.surfaces?.length ?? 0)}
    help="The scene's physical areas in order – a left and a right page, a fold-out's third, a cover, a wall – with their label as printed, side and size. Add, reorder, remove; a click on a side selects the surface (its size, place and reference image). The Surface tool (S) picks them on the stage.">
    <SurfaceList {bookId} sceneId={spreadId} {page} />
  </Section>
{/if}

<style>
  .value { min-width: 0; overflow-wrap: anywhere; }
  .group-link { flex: none; margin-left: .25rem; }
</style>
