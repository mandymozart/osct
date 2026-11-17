<script lang="ts">
  import { untrack } from "svelte";
  import Section from "#lib/components/Section.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { sceneName, surfaceSize, targetsOf } from "#lib/scene-strip.js";
  import { errorText } from "#lib/api.js";
  import { SCENE_LAYOUTS, type SceneLayout, type SurfaceData } from "@shared/types/game-config";

  /**
   * The open **scene** in the Inspector (#307 phase 3a), above the spread's own sections: its label (what the reader's
   * switcher and lists show), its layout (fixed – printed together – or free), its group, its targets, and its
   * **surfaces** – each with its side, its size and its label as printed (editable). Every field saves itself
   * (`PUT …/scenes/{id}`, RULES #37); a surface's label goes with the whole list, as the API takes it. Reference images
   * per surface come with phase 3b.
   */
  let { bookId, spreadId }: { bookId: string; spreadId: string } = $props();

  $effect(() => {
    const id = bookId;
    if (scenes.bookId !== id) void scenes.load(id);
  });

  const scene = $derived(scenes.scene(spreadId));
  /** What was typed, per scene – a save's answer never writes over it */
  let label = $state("");
  let surfaceLabels = $state<Record<string, string>>({});
  let shownFor: string | null = null;
  $effect(() => {
    const s = scene;
    if (!s || s.id === shownFor) return;
    shownFor = s.id;
    untrack(() => {
      label = s.label ?? "";
      surfaceLabels = Object.fromEntries((s.surfaces ?? []).map(surface => [surface.id, surface.label ?? ""]));
    });
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
  const editSurface = (surfaceId: string, value: string) => {
    surfaceLabels = { ...surfaceLabels, [surfaceId]: value };
    const id = spreadId;
    const labels = $state.snapshot(surfaceLabels);
    autosave.queue(`scene:${bookId}:${id}:surfaces`, async () => {
      const surfaces = scenes.scene(id)?.surfaces ?? [];
      const next: SurfaceData[] = surfaces.map(s => {
        const { label: _old, ...rest } = s;
        const typed = (labels[s.id] ?? s.label ?? "").trim();
        return typed ? { ...rest, label: typed } : rest;
      });
      if (next.some((s, i) => (s.label ?? "") !== (surfaces[i].label ?? ""))) await scenes.putScene(id, { surfaces: next });
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
    <div class="row" data-help="The group the scene belongs to – one stop of the reader's switcher, one loading window. None: the scene is a stop of its own.">
      <span class="label">group</span>
      <select class="field" aria-label="Scene group" value={scene.group ?? ""} onchange={e => void put({ group: e.currentTarget.value || null })}>
        <option value="">– its own stop</option>
        {#each scenes.groups as group (group.id)}<option value={group.id}>{group.label}</option>{/each}
      </select></div>
    <div class="row" data-help="The targets on this scene – the engine tracks at most 10 per scene (4 at the same moment).">
      <span class="label">targets</span>
      <span class="value">{targetsOf(scene)} of 10</span></div>
    {#if error}<p class="small danger">{error}</p>{/if}
  </Section>

  <Section id="stage.surfaces" label="surfaces" summary={String(scene.surfaces?.length ?? 0)}
    help="The scene's physical areas in order – a left and a right page, a fold-out's third, a cover, a wall – with their size and label as printed.">
    {#each scene.surfaces ?? [] as surface (surface.id)}
      <div class="surface">
        <div class="row" data-help="The surface's label, written exactly as printed (41, ii, Cover) – none when nothing is printed. Saved by itself.">
          <span class="label">{surface.side}</span>
          <input class="field" aria-label="Label of surface {surface.id}" placeholder="no label" value={surfaceLabels[surface.id] ?? surface.label ?? ""}
            oninput={e => editSurface(surface.id, e.currentTarget.value)} /></div>
        <div class="row"><span class="label">size</span><span class="value muted">{surfaceSize(surface)}</span></div>
      </div>
    {:else}
      <p class="small muted">No surfaces yet – the book's migration (migrate_scenes) gives a scene its pages as surfaces.</p>
    {/each}
  </Section>
{/if}

<style>
  .value { min-width: 0; overflow-wrap: anywhere; }
  .surface + .surface { border-top: 1px solid var(--line); padding-top: .125rem; }
</style>
