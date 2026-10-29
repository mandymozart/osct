<script lang="ts">
  import { environmentEdit, fitsSlot, type EnvironmentSlot } from "$lib/environment.svelte";
  import { library } from "$lib/library.svelte";
  import { content } from "$lib/content.svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import Segmented from "$lib/components/Segmented.svelte";

  /**
   * The book's **environment** on the stage (content schema 2.8 / 2.10): the world around the reader while scanning, its
   * sky and the onion sky. While this tab is open the stage shows the engine's look-around world with the values being
   * edited, under the desk and the book, turned by the view (*look up* raises the camera from the book to the horizon).
   * **World**: the built-in café, or a glTF model from the Library (or uploaded here); **sky**: the world's own, or an
   * equirectangular image. *Library…* opens the Library to pick one (its *World* / *Sky* button); **Save** writes the
   * environment to the draft, *Back to the draft* undoes, *Use the default* removes it (the café with the onion sky).
   * Book-level only; the reader's Graphics switches (Info → Settings) still apply on top.
   */
  let { stage, bookId, onlibrary }: { stage: Stage | null; bookId: string; onlibrary: (slot: EnvironmentSlot) => void } = $props();

  const edit = environmentEdit;
  const ACCEPT: Record<EnvironmentSlot, string> = { world: ".glb,.gltf", sky: ".jpg,.jpeg,.png,.webp" };
  const BUILT_IN: Record<EnvironmentSlot, string> = { world: "café (built-in)", sky: "the world's" };
  const SOURCE: Record<EnvironmentSlot, "worldSrc" | "skySrc"> = { world: "worldSrc", sky: "skySrc" };

  let lookUp = $state(0);
  let notice = $state<string | null>(null);
  let inputs = $state<Partial<Record<EnvironmentSlot, HTMLInputElement>>>({});

  $effect(() => {
    void edit.load(bookId);
    if (library.bookId !== bookId) void library.load(bookId);
  });
  $effect(() => stage?.setLookUp(lookUp));

  /** A slot's file as a name: the library's, else the URL's last part */
  const nameOf = (url: string): string => library.byUrl(url)?.name ?? decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? url);

  const upload = async (slot: EnvironmentSlot, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
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
    } finally {
      const input = inputs[slot];
      if (input) input.value = "";
    }
  };

  const afterSave = async (ok: boolean) => {
    if (!ok) return;
    notice = "Saved";
    // The draft carries it now: the stage builds from it (the preview keeps showing the same values)
    await content.load(bookId);
    await stage?.refresh();
    void library.refresh();
  };
</script>

<div class="section"><span class="section-label">environment</span>
  <span class="small muted" data-help-name="Environment" data-help="The book's world around the reader while scanning, its sky and the onion sky – shown on the stage while this tab is open: the reader's own look-around pass, anchored to the book, turned by the view. The reader's Graphics switches (Info → Settings) still apply on top.">{edit.saved ? "this book's" : "the default"}</span></div>

{#snippet slotRow(slot: EnvironmentSlot)}
  {@const src = edit.edited[SOURCE[slot]]}
  <div class="row" class:changed={(src ?? null) !== (edit.saved?.[SOURCE[slot]] ?? null)}
    data-help={slot === "world"
      ? "The scenery around the reader: the built-in café, or a glTF model (its origin the floor under the reader, −z towards the book). Library… picks one there (its World button), Upload adds one, remove goes back to the café."
      : "The sky: the world's own, or an equirectangular image (2:1, its centre towards the book). Library… picks one there (its Sky button), Upload adds one, remove goes back to the world's."}>
    <span class="label">{slot}</span>
    <span class="controls">
      <span class="file" class:muted={!src} title={src ?? ""}>{src ? nameOf(src) : BUILT_IN[slot]}</span>
      <button type="button" class="pill" class:on={edit.picking === slot} aria-pressed={edit.picking === slot}
        title={slot === "world" ? "Pick a glTF model in the Library (its World button)" : "Pick an equirectangular image in the Library (its Sky button)"}
        onclick={() => onlibrary(slot)}>Library…</button>
      <button type="button" class="pill" onclick={() => inputs[slot]?.click()}>Upload</button>
      <input bind:this={inputs[slot]} type="file" accept={ACCEPT[slot]} hidden onchange={e => void upload(slot, (e.currentTarget as HTMLInputElement).files)} />
      {#if src}<button type="button" class="text-link" title="Back to the {BUILT_IN[slot]}" onclick={() => edit.use(slot, null)}>remove</button>{/if}
    </span>
  </div>
{/snippet}

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

<div class="section"><span class="section-label">preview</span></div>
<div class="row" data-help="Raise the stage's camera from the book towards the horizon and the sky (the book stays found, as the reader's world stays).">
  <span class="label">look up</span>
  <span class="w"><ScrubNumber value={lookUp} min={-30} max={90} step={1} fallback={0} unit="°" label="look up" strict oninput={v => (lookUp = v)} /></span>
</div>

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

<style>
  .file { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
