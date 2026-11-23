<script lang="ts">
  import type { Scene } from "@engine/types";
  import { ENTRY_CATEGORIES, EntryCategory } from "@shared/types/entry";
  import { addEntry, errorText } from "#lib/api.js";
  import Segmented from "#lib/components/Segmented.svelte";
  import { CATEGORY_LABELS } from "#lib/new-target.js";
  import { surfaceChoices } from "#lib/surface-edit.js";
  import { sceneLabel } from "@engine/content/scenes";

  /**
   * A new entry without a printed image on the open scene (the tree's + menu, *entry…*, #237): read in the reader's list only,
   * like a glossary term – its title, category and, in a scene of several surfaces, its surface. The API makes it
   * (`POST …/entries` without `target`); the caller reloads the content and selects it, so its form opens in the
   * Inspector. A target can follow on the stage.
   */
  let { experienceId, scene, oncreated, oncancel }: {
    experienceId: string;
    scene: Scene;
    oncreated: (entryId: string) => Promise<void>;
    oncancel: () => void;
  } = $props();

  /** The scene's surfaces an entry may name – only while it has several (`EntryData.surface`) */
  const surfaces = $derived(surfaceChoices(scene.surfaces));
  let title = $state("");
  /** The surface the entry lies on ("" = none: the scene as a whole) */
  let surface = $state("");
  let category = $state<EntryCategory>(EntryCategory.Glossary);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const create = async () => {
    busy = true;
    error = null;
    try {
      const { entry } = await addEntry(experienceId, { title: title.trim(), scene: scene.id, ...(surface && surfaces.length > 1 ? { surface } : {}), category });
      await oncreated(entry.id);
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

<form class="form" onsubmit={e => { e.preventDefault(); void create(); }}>
  <div class="section"><span class="section-label">new entry on {sceneLabel(scene)}</span>
    <button type="button" class="text-link" onclick={oncancel}>cancel</button></div>
  <div class="row"><span class="label">title</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" bind:value={title} placeholder="the term or the text's title" aria-label="New entry's title" autofocus /></div>
  <div class="row" data-help-name="Entry category" data-help="Where the entry is listed in the reader's consultation menu: Marginalia (the glossary), Texts, Links – or behind the Videos button.">
    <span class="label">listed in</span>
    <span class="controls"><Segmented options={ENTRY_CATEGORIES} value={category} labels={CATEGORY_LABELS} label="New entry's category" onchange={c => (category = c)} /></span></div>
  {#if surfaces.length > 1}
    <div class="row" data-help-name="Surface" data-help="The surface of the scene the entry lies on – the reader's list names its label, else the scene's. None: the scene as a whole.">
      <span class="label">surface</span>
      <span class="controls"><Segmented options={["", ...surfaces.map(c => c.value)]} value={surface} labels={{ "": "none", ...Object.fromEntries(surfaces.map(c => [c.value, c.label])) }} label="New entry's surface" onchange={s => (surface = s)} /></span></div>
  {/if}
  <div class="actions">
    <span class="grow"></span>
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="submit" class="pill primary" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create entry"}</button>
  </div>
</form>

<style>
  .form { display: flex; flex-direction: column; gap: .125rem; }
  .row > .field { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
