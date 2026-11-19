<script lang="ts">
  import { untrack } from "svelte";
  import { addScene, errorText } from "#lib/api.js";
  import { SCENE_PRESETS, type ScenePreset } from "@shared/api/editor";
  import { sceneLabel } from "@engine/content/scenes";
  import Segmented from "#lib/components/Segmented.svelte";
  import { PRESET_LABELS } from "#lib/ScenesPanel.svelte";

  /**
   * The creation step of a new scene (#238, #319) – in the page, no browser dialog: the **preset** (a double page – one
   * surface twice the page's width –, a single page, a wall standing ahead), the **label** (what the reader's switcher
   * and lists show) and **where** it goes (after which scene; nothing renumbers). *Create* asks the API
   * (`POST …/scenes`); the caller reloads and shows the new scene. Every experience adds scenes (#320).
   */
  let { experienceId, scenes, after = null, oncreated, oncancel }: {
    experienceId: string;
    scenes: readonly { id: string; label: string }[];
    /** The scene it follows at first (the menu's *Add a scene after*); none: the last */
    after?: string | null;
    oncreated: (sceneId: string) => void | Promise<void>;
    oncancel: () => void;
  } = $props();

  let preset = $state<ScenePreset>("double");
  let label = $state("");
  let place = $state<string | null>(untrack(() => (scenes.some(s => s.id === after) ? after : (scenes.at(-1)?.id ?? null))));
  let busy = $state(false);
  let error = $state<string | null>(null);

  const create = async () => {
    busy = true;
    error = null;
    try {
      const name = label.trim();
      const { scene } = await addScene(experienceId, { preset, ...(place ? { after: place } : {}), ...(name ? { label: name } : {}) });
      await oncreated(scene.id);
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

<form class="new-scene" aria-label="New scene" onsubmit={e => { e.preventDefault(); void create(); }}>
  <div class="section"><span class="section-label">new scene</span>
    <button type="button" class="text-link" onclick={oncancel}>cancel</button></div>
  <div class="row" data-help-name="Preset" data-help="What the scene starts with: a double page (one surface twice the page's width), a single page (a cover is a single scene first in the order) or a wall standing ahead (2000 × 1500 mm). Surfaces are added and placed afterwards.">
    <span class="label">preset</span>
    <span class="controls"><Segmented options={SCENE_PRESETS} value={preset} labels={PRESET_LABELS} label="New scene's preset" onchange={p => (preset = p)} /></span></div>
  <div class="row" data-help-name="Label" data-help="What the reader's switcher and lists show for the scene – free text (40–41, Cover, Studio wall).">
    <span class="label">label</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" bind:value={label} placeholder="e.g. 40–41" aria-label="New scene's label" autofocus /></div>
  <div class="row" data-help-name="Position" data-help="The scene it follows in the experience's order. Nothing renumbers: the order is the scenes' only order.">
    <span class="label">after</span>
    <select class="field" aria-label="The scene it follows" value={place ?? ""} onchange={e => (place = e.currentTarget.value || null)}>
      {#if !scenes.length}<option value="">the start</option>{/if}
      {#each scenes as scene (scene.id)}<option value={scene.id}>{sceneLabel(scene)}</option>{/each}
    </select></div>
  <div class="actions">
    <span class="grow"></span>
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="submit" class="pill primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
  </div>
</form>

<style>
  .new-scene { display: flex; flex-direction: column; gap: .125rem; }
  .row > .field { width: 100%; min-width: 0; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
