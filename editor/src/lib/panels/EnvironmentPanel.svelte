<script lang="ts">
  import { environmentEdit, fitsSlot, type EnvironmentSlot } from "#lib/environment.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { pickAccept, type LibraryPick } from "#lib/library-pick.js";
  import { fileNameOf } from "#lib/library-place.js";
  import { content } from "#lib/content.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import FileField from "#lib/components/FileField.svelte";
  import Section from "#lib/components/Section.svelte";
  import LibraryPanel from "./LibraryPanel.svelte";
  import { errorText } from "#lib/api.js";

  /**
   * The book's **environment** on the stage: the world around the reader while scanning, its
   * sky and the onion sky. While this tab is open the stage shows the engine's look-around world with the values being
   * edited, under the desk and the book, turned by the view (*look up* raises the camera from the book to the horizon).
   * Once the book has an environment (or edits start one) its world is the stage's sky in the other tabs too, while
   * rendered – it replaces the HDRI, sky and light (#185, `stage/sky.ts`).
   * **World**: the built-in café, or a glTF model from the Library (or uploaded here); **sky**: the world's own, or an
   * equirectangular image. *Library…* opens the Library here as a picker (a glTF model, a sky image – the stage keeps
   * previewing); **Save** writes the
   * environment to the draft, *Back to the draft* undoes, *Use the default* removes it (the café with the onion sky).
   * Book-level only; the reader's Graphics switches (Info → Settings) still apply on top. Two collapsible sections: the
   * environment open on the first visit, the stage's *preview* (look up) closed, its head naming the angle.
   */
  let { stage, bookId }: { stage: Stage | null; bookId: string } = $props();

  const edit = environmentEdit;
  const BUILT_IN: Record<EnvironmentSlot, string> = { world: "café (built-in)", sky: "the world's" };
  const SOURCE: Record<EnvironmentSlot, "worldSrc" | "skySrc"> = { world: "worldSrc", sky: "skySrc" };

  let lookUp = $state(0);
  let notice = $state<string | null>(null);
  /** The Library as the picker of the slot being chosen (`edit.picking`) */
  const pick = $derived.by<LibraryPick | null>(() => {
    const slot = edit.picking;
    if (!slot) return null;
    return { subject: { for: "environment", slot }, label: slot === "world" ? "the world – a glTF model" : "the sky – an equirectangular image",
      current: edit.edited[SOURCE[slot]], onpick: asset => edit.use(slot, asset.url), oncancel: () => (edit.picking = null) };
  });

  $effect(() => {
    void edit.load(bookId);
    if (library.bookId !== bookId) void library.load(bookId);
  });
  $effect(() => stage?.setLookUp(lookUp));

  /** A slot's file as a name: the library's, else the URL's last part */
  const nameOf = (url: string): string => library.byUrl(url)?.name ?? fileNameOf(url);

  const upload = async (slot: EnvironmentSlot, file: File) => {
    notice = null;
    try {
      const asset = await library.upload(bookId, file);
      if (!fitsSlot(asset, slot)) {
        notice = `${asset.name} is no ${slot === "world" ? "glTF model" : "jpg, png or webp image"} – it stays in the Library`;
        return;
      }
      edit.use(slot, asset.url);
    } catch {
      // the library shows the error
    }
  };

  const afterSave = async (ok: boolean) => {
    if (!ok) return;
    notice = "Saved";
    // The draft carries it now: the stage builds from it (the preview keeps showing the same values)
    try {
      await content.load(bookId);
      await stage?.refresh();
    } catch (e) {
      edit.error = errorText(e);
    }
    void library.refresh();
  };
</script>

{#if pick}
<LibraryPanel {bookId} {pick} />
{:else}
{#snippet whose()}
  <span class="small muted">{edit.saved ? "this book's · the stage's sky" : "the default"}</span>
{/snippet}

{#snippet slotRow(slot: EnvironmentSlot)}
  {@const src = edit.edited[SOURCE[slot]]}
  <div class="row" class:changed={(src ?? null) !== (edit.saved?.[SOURCE[slot]] ?? null)}
    data-help={slot === "world"
      ? "The scenery around the reader: the built-in café, or a glTF model (its origin the floor under the reader, −z towards the book). Library… picks one, Upload adds one, remove goes back to the café."
      : "The sky: the world's own, or an equirectangular image (2:1, its centre towards the book). Library… picks one, Upload adds one, remove goes back to the world's."}>
    <span class="label">{slot}</span>
    <span class="controls">
      <FileField {src} picture={slot === "sky"} empty={BUILT_IN[slot]} accept={pickAccept({ for: "environment", slot })} label={slot === "world" ? "a glTF model as the world" : "an equirectangular image as the sky"}
        onlibrary={() => (edit.picking = slot)} onupload={f => void upload(slot, f)} />
      {#if src}<button type="button" class="text-link" title="Back to the {BUILT_IN[slot]}" onclick={() => edit.use(slot, null)}>remove</button>{/if}
    </span>
  </div>
{/snippet}

<Section id="environment.world" label="environment" aside={whose}
  help="The book's world around the reader while scanning, its sky and the onion sky – shown on the stage while this tab is open: the reader's own look-around pass, anchored to the book, turned by the view. Once the book has one, its world replaces the HDRI as the stage's sky (rendered), lit by the scene's own lights as in the reader. The reader's Graphics switches (Info → Settings) still apply on top.">
{@render slotRow("world")}
{@render slotRow("sky")}
<div class="row" class:changed={edit.edited.onionSky !== (edit.saved?.onionSky ?? true)}
  data-help="Looking up, sky-like parts of the camera picture show the world's sky. It needs a camera picture, so only the reader shows it.">
  <span class="label">onion sky</span>
  <span class="controls">
    <Segmented options={["on", "off"] as const} value={edit.edited.onionSky ? "on" : "off"}
      titles={{ on: "Looking up, sky-like parts of the camera picture show the world's sky", off: "The camera picture's sky stays" }}
      onchange={value => edit.set({ onionSky: value === "on" })} />
  </span>
</div>
{#if library.error}<div class="row"><span class="small danger">{library.error}</span></div>{/if}
{#if library.uploading.length}<div class="row"><span class="small muted">Uploading {library.uploading.join(", ")}…</span></div>{/if}
</Section>

<Section id="environment.preview" label="preview" open={false} summary="look up {lookUp}°" help="How the stage shows the world – not saved.">
<div class="row" data-help="Raise the stage's camera from the book towards the horizon and the sky (the book stays found, as the reader's world stays).">
  <span class="label">look up</span>
  <span class="w"><ScrubNumber value={lookUp} min={-30} max={90} step={1} fallback={0} unit="°" label="look up" strict oninput={v => (lookUp = v)} /></span>
</div>
</Section>

{#if edit.dirty || edit.saved || notice || edit.error}
  <div class="actions">
    <button type="button" class="text-link" onclick={() => { edit.revert(); notice = null; }} disabled={!edit.dirty}>Back to the draft</button>
    {#if edit.saved}<button type="button" class="text-link" disabled={edit.saving} onclick={async () => afterSave(await edit.save(null))}>Use the default</button>{/if}
    <span class="grow"></span>
    {#if notice}<span class="small muted">{notice}</span>{/if}
    {#if edit.error}<span class="small danger">{edit.error}</span>{/if}
    <button type="button" class="pill primary" disabled={!edit.dirty || edit.saving} onclick={async () => afterSave(await edit.save())}>
      {edit.saving ? "Saving…" : "Save"}
    </button>
  </div>
{/if}
{/if}

<style>
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
