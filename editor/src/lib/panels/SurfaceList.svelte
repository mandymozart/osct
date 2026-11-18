<script lang="ts">
  import { untrack } from "svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { selection } from "#lib/selection.svelte.js";
  import { errorText } from "#lib/api.js";
  import { surfaceSize } from "#lib/scene-strip.js";
  import { SURFACE_PRESETS, sameSurfaces, updateSurface, type SurfacePreset } from "#lib/surface-edit.js";
  import { addSceneSurface, moveSceneSurface, removeSceneSurface, surfaceRemovalWarning } from "#lib/surface-actions.js";

  /**
   * A scene's **surfaces** as a list (#314) – the Inspector's scene section: each surface with its label as printed
   * (saved by itself), its side and size; a click on its side selects it (the Inspector shows all its fields, the stage
   * highlights it); ↑ ↓ reorder, ✕ removes after a confirmation that names what lies on it; *+ page / wall / custom* adds
   * one. The edits are `surface-actions.ts`, shared with the Tree's Surfaces level and the selected surface.
   */
  let { bookId, sceneId, page }: { bookId: string; sceneId: string; page: { width: number; height: number } } = $props();

  const scene = $derived(scenes.scene(sceneId));
  const surfaces = $derived(scene?.surfaces ?? []);

  /** What was typed, per scene – a save's answer never writes over it (RULES #37) */
  let labels = $state<Record<string, string>>({});
  let shownFor: string | null = null;
  $effect(() => {
    const s = scene;
    if (!s || s.id === shownFor) return;
    shownFor = s.id;
    untrack(() => (labels = Object.fromEntries((s.surfaces ?? []).map(surface => [surface.id, surface.label ?? ""]))));
  });
  const editLabel = (surfaceId: string, value: string) => {
    labels = { ...labels, [surfaceId]: value };
    const id = sceneId;
    autosave.queue(`scene:${bookId}:${id}:surfaces`, async () => {
      const now = scenes.scene(id)?.surfaces ?? [];
      const next = updateSurface(now, surfaceId, { label: value });
      if (!sameSurfaces(next, now)) await scenes.putScene(id, { surfaces: next });
    });
  };

  let error = $state<string | null>(null);
  let busy = $state(false);
  const run = async (action: () => Promise<unknown>) => {
    error = null;
    busy = true;
    try {
      await action();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  };
  /** The surface whose removal waits for its confirmation */
  let removing = $state<string | null>(null);
  const PRESET_TITLES: Record<SurfacePreset, string> = {
    page: "A page of the book's size – the left page, the right, then a fold-out's middle",
    wall: "A wall, 2000 × 1500 mm, standing ahead behind the pages – the scene becomes free (each surface on its own place)",
    custom: "A surface of 300 × 300 mm – set its side and size in the Inspector",
  };
  const isOn = (surfaceId: string) => selection.surface?.scene === sceneId && selection.surface.id === surfaceId;
</script>

{#each surfaces as surface, i (surface.id)}
  <div class="surface" class:on={isOn(surface.id)}>
    <div class="row" data-help="The surface's label, written exactly as printed (41, ii, Cover) – none when nothing is printed. Saved by itself. A click on its side selects it: the Inspector shows its size, place and reference image.">
      <button type="button" class="label side" onclick={() => selection.selectSurface(sceneId, surface.id)} title="Select the surface {surface.id}: its fields in the Inspector, highlighted on the stage">{surface.side}</button>
      <input class="field" aria-label="Label of surface {surface.id}" placeholder="no label" value={labels[surface.id] ?? surface.label ?? ""}
        oninput={e => editLabel(surface.id, e.currentTarget.value)} />
      <button type="button" class="icon-button" disabled={busy || i === 0} onclick={() => void run(() => moveSceneSurface(sceneId, surface.id, -1))} title="Move up: one place earlier in the scene" aria-label="Move {surface.id} up"><Icon name="up" /></button>
      <button type="button" class="icon-button" disabled={busy || i === surfaces.length - 1} onclick={() => void run(() => moveSceneSurface(sceneId, surface.id, 1))} title="Move down: one place later in the scene" aria-label="Move {surface.id} down"><Icon name="down" /></button>
      <button type="button" class="icon-button" disabled={busy} onclick={() => (removing = removing === surface.id ? null : surface.id)} title="Remove the surface…" aria-label="Remove {surface.id}"><Icon name="close" /></button>
    </div>
    <div class="row"><span class="label">size</span><span class="value muted">{surfaceSize(surface)}{surface.place && scene?.layout === "free" ? " · placed" : ""}</span></div>
    {#if removing === surface.id}
      {@const warning = surfaceRemovalWarning(sceneId, surface.id)}
      <p class="small confirm">Remove the surface {surface.label ? `${surface.label} (${surface.side})` : surface.side}? {warning || "Nothing lies on it."} Its reference image goes with it.
        <button type="button" class="pill framed danger" disabled={busy} onclick={() => void run(async () => { await removeSceneSurface(sceneId, surface.id); removing = null; })}>remove</button>
        <button type="button" class="pill" onclick={() => (removing = null)}>keep</button></p>
    {/if}
  </div>
{:else}
  <p class="small muted">No surfaces yet – add the scene's pages, a wall or a surface of your own.</p>
{/each}
<div class="row add" data-help="Adds a surface to the scene: a page of the book's size, a wall standing ahead (the scene becomes free), or a custom one – it is selected, so the Inspector shows its fields.">
  <span class="label">+ surface</span>
  <span class="controls">
    {#each SURFACE_PRESETS as preset (preset)}
      <button type="button" class="pill framed" disabled={busy || !scene} title={PRESET_TITLES[preset]} onclick={() => void run(() => addSceneSurface(sceneId, preset, page))}>{preset}</button>
    {/each}
  </span>
</div>
{#if error}<p class="small danger">{error}</p>{/if}

<style>
  .surface + .surface { border-top: 1px solid var(--line); padding-top: .125rem; }
  .surface.on { box-shadow: inset 2px 0 0 var(--text); }
  .side { padding: 0; border: none; background: none; color: inherit; text-align: left; cursor: pointer; text-decoration: underline dotted; text-underline-offset: .2em; }
  .value { min-width: 0; overflow-wrap: anywhere; }
  .confirm { margin: .125rem 0 .25rem; }
  .confirm .pill { margin-left: .25rem; }
</style>
