<script lang="ts">
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { errorText, getExperience } from "#lib/api.js";
  import { readStoredJson } from "#lib/storage.js";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import type { Point } from "#lib/context-menu.js";
  import { PRESET_LABELS } from "#lib/ScenesPanel.svelte";
  import { scenes } from "#lib/scenes.svelte.js";
  import { SCENE_PRESETS } from "@shared/api/editor";

  /**
   * An experience's address opens a scene (Tilman, 2026-11-18: the overview page and the Pages view were redundant – the
   * Scenes panel under the stage has the scenes, their order and groups): the scene last open in this browser, else the
   * first. An experience without scenes offers its first one here.
   */
  const experienceId = $derived(page.params.experience ?? "");
  let error = $state<string | null>(null);
  let empty = $state(false);

  $effect(() => {
    const id = experienceId;
    if (!id) return;
    empty = false;
    error = null;
    getExperience(id).then(tree => {
      const ids = tree.scenes.map(scene => scene.id);
      if (!ids.length) {
        empty = true;
        return;
      }
      const last = (readStoredJson(`osct-editor-last-scene:${id}`) as string | null) ?? null;
      const open = last && ids.includes(last) ? last : ids[0];
      void goto(resolve(`${id}/${open}/`), { replaceState: true });
    }, e => (error = errorText(e)));
  });

  let menu = $state<Point | null>(null);
  let button = $state<HTMLButtonElement>();
  const items = $derived<MenuItem[]>(SCENE_PRESETS.map(preset => ({
    label: PRESET_LABELS[preset],
    select: () => void (async () => {
      try {
        await scenes.load(experienceId, true);
        const created = await scenes.add(preset);
        void goto(resolve(`${experienceId}/${created}/`), { replaceState: true });
      } catch (e) {
        error = errorText(e);
      }
    })(),
  })));
</script>

<main class="open-scene">
  {#if error}
    <p class="small danger" role="alert">{error}</p>
  {:else if empty}
    <p class="muted">This experience has no scene yet.</p>
    <button type="button" class="pill" bind:this={button} onclick={() => { const r = button!.getBoundingClientRect(); menu = { x: r.left, y: r.bottom }; }}>Add the first scene…</button>
    {#if menu}<ContextMenu at={menu} label="Add a scene" head="The first scene" {items} returnFocus={button} onclose={() => (menu = null)} />{/if}
  {:else}
    <p class="muted small">Opening the experience…</p>
  {/if}
</main>

<style>
  .open-scene { padding: 2rem 1.5rem; display: flex; flex-direction: column; align-items: flex-start; gap: .75rem; }
</style>
