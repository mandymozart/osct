<script lang="ts">
  import { environmentEdit, fitsSlot, type EnvironmentSlot } from "#lib/environment.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { pickAccept, type LibraryPick } from "#lib/library-pick.js";
  import { fileNameOf } from "#lib/library-place.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Toggle from "#lib/components/Toggle.svelte";
  import FileField from "#lib/components/FileField.svelte";
  import Section from "#lib/components/Section.svelte";
  import LibraryPanel from "./LibraryPanel.svelte";

  /**
   * The experience's **environment** on the stage: the sky around the reader while scanning and the onion sky – the world
   * model is gone (Tilman, 2026-11-18, #310): no world row, a content's `worldSrc` is ignored. While this tab is open the stage shows the engine's look-around world with the values being
   * edited, under the desk and the experience, turned by the view (*look up* raises the camera from the experience to the horizon).
   * Once the experience has an environment (or edits start one) its world is the stage's sky in the other tabs too, while
   * rendered – it replaces the HDRI, sky and light (#185, `stage/sky.ts`).
   * **Sky**: none, or an equirectangular image. *Library…* opens the Library here as a picker (a sky image – the stage keeps
   * previewing). Every edit reaches the draft by itself a moment later (#259); *Undo edits* goes back to the environment
   * the draft had before the first edit in this page, *Use the default* removes it (nothing around the experience).
   * Experience-level only; the reader's Graphics switches (Info → Settings) still apply on top. Two collapsible sections: the
   * environment open on the first visit, the stage's *preview* (look up) closed, its head naming the angle.
   */
  let { stage, experienceId }: { stage: Stage | null; experienceId: string } = $props();

  const edit = environmentEdit;
  const BUILT_IN: Record<EnvironmentSlot, string> = { sky: "none" };
  const SOURCE: Record<EnvironmentSlot, "skySrc"> = { sky: "skySrc" };

  let lookUp = $state(0);
  let notice = $state<string | null>(null);
  /** The Library as the picker of the slot being chosen (`edit.picking`) */
  const pick = $derived.by<LibraryPick | null>(() => {
    const slot = edit.picking;
    if (!slot) return null;
    return { subject: { for: "environment", slot }, label: "the sky – an equirectangular image",
      current: edit.edited[SOURCE[slot]], onpick: asset => edit.use(slot, asset.url), oncancel: () => (edit.picking = null) };
  });

  $effect(() => {
    void edit.load(experienceId);
    if (library.experienceId !== experienceId) void library.load(experienceId);
  });
  $effect(() => stage?.setLookUp(lookUp));

  /** A slot's file as a name: the library's, else the URL's last part */
  const nameOf = (url: string): string => library.byUrl(url)?.name ?? fileNameOf(url);

  const upload = async (slot: EnvironmentSlot, file: File) => {
    notice = null;
    try {
      const asset = await library.upload(experienceId, file);
      if (!fitsSlot(asset, slot)) {
        notice = `${asset.name} is no jpg, png or webp image – it stays in the Library`;
        return;
      }
      edit.use(slot, asset.url);
    } catch {
      // the library shows the error
    }
  };
</script>

{#if pick}
<LibraryPanel {experienceId} {pick} />
{:else}
{#snippet whose()}
  <span class="small muted">{edit.saved ? "this experience's · the stage's sky" : "the default"}</span>
{/snippet}

{#snippet slotRow(slot: EnvironmentSlot)}
  {@const src = edit.edited[SOURCE[slot]]}
  <div class="row slot" class:changed={(src ?? null) !== (edit.saved?.[SOURCE[slot]] ?? null)}
    data-help="The sky: an equirectangular image (2:1, its centre towards the experience), or none. Library… picks one, Upload adds one, remove leaves none.">
    <span class="label">{slot}</span>
    <span class="controls">
      <FileField {src} picture empty={BUILT_IN[slot]} accept={pickAccept({ for: "environment", slot })} label="an equirectangular image as the sky"
        onlibrary={() => (edit.picking = slot)} onupload={f => void upload(slot, f)} />
      {#if src}<button type="button" class="text-link" title="Back to the {BUILT_IN[slot]}" onclick={() => edit.use(slot, null)}>remove</button>{/if}
    </span>
  </div>
{/snippet}

<Section id="environment.world" label="environment" aside={whose}
  help="The experience's sky around the reader while scanning and the onion sky – shown on the stage while this tab is open: the reader's own look-around pass, anchored to the experience, turned by the view. Once the experience has one, its sky replaces the HDRI as the stage's sky (rendered), lit by the scene's own lights as in the reader. The reader's Graphics switches (Info → Settings) still apply on top.">
{@render slotRow("sky")}
<div class="row" class:changed={edit.edited.onionSky !== (edit.saved?.onionSky ?? true)}
  data-help="Looking up, sky-like parts of the camera picture show the environment's sky. It needs a camera picture, so only the reader shows it.">
  <span class="label">onion sky</span>
  <span class="controls">
    <Toggle on={edit.edited.onionSky} label="Onion sky"
      title={edit.edited.onionSky ? "On: looking up, sky-like parts of the camera picture show the environment's sky" : "Off: the camera picture's sky stays"}
      onchange={onionSky => edit.set({ onionSky })} />
  </span>
</div>
{#if library.error}<div class="row"><span class="small danger">{library.error}</span></div>{/if}
{#if library.uploading.length}<div class="row"><span class="small muted">Uploading {library.uploading.join(", ")}…</span></div>{/if}
</Section>

<Section id="environment.preview" label="preview" open={false} summary="look up {lookUp}°" help="How the stage shows the sky – not saved.">
<div class="row" data-help="Raise the stage's camera from the experience towards the horizon and the sky (the experience stays found, as in the reader).">
  <span class="label">look up</span>
  <span class="w"><ScrubNumber value={lookUp} min={-30} max={90} step={1} fallback={0} unit="°" label="look up" strict oninput={v => (lookUp = v)} /></span>
</div>
</Section>

{#if edit.canUndo || edit.saved || notice || edit.error}
  <div class="actions">
    <button type="button" class="text-link" onclick={() => { edit.undo(); notice = null; }} disabled={!edit.canUndo} data-help-name="Undo edits"
      data-help="Edits reach the draft by themselves, a moment after the last change. Undo edits takes the environment back to how the draft had it before its first edit since this page was opened.">Undo edits</button>
    {#if edit.saved}<button type="button" class="text-link" onclick={() => { edit.useDefault(); notice = null; }}
      data-help-name="Use the default" data-help="Removes the experience's environment: nothing is drawn around the scene.">Use the default</button>{/if}
    <span class="grow"></span>
    {#if notice}<span class="small muted">{notice}</span>{/if}
    {#if edit.error}<span class="small danger">{edit.error}</span>{/if}
  </div>
{/if}
{/if}

<style>
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
  /* The sky as a block of its own: its label at the top, beside its picture */
  .slot { align-items: flex-start; padding: .25rem 0; border-bottom: 1px solid var(--line); }
  .slot > .label { padding-top: .35rem; }
</style>
