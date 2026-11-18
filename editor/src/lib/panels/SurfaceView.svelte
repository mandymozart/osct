<script lang="ts">
  import { untrack } from "svelte";
  import Section from "#lib/components/Section.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import FileField from "#lib/components/FileField.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { selection } from "#lib/selection.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { errorText } from "#lib/api.js";
  import { sceneName } from "#lib/scene-strip.js";
  import { pickAccept, type LibraryPick } from "#lib/library-pick.js";
  import { sameSurfaces, surfaceName, updateSurface, type SurfacePatch } from "#lib/surface-edit.js";
  import { moveSceneSurface, removeSceneSurface, surfaceRemovalWarning } from "#lib/surface-actions.js";
  import { surfaceMode } from "#lib/surface-mode.svelte.js";
  import { SURFACE_GIZMO_MODES } from "#lib/stage/surface-gizmo.js";
  import { REFERENCE_FITS } from "#lib/stage/surfaces.js";
  import { SURFACE_SIDES, type SurfaceData, type SurfacePlace } from "@shared/types/game-config";
  import type { SurfaceReferenceFit } from "@shared/api/editor";
  import LibraryPanel from "./LibraryPanel.svelte";

  /**
   * The selected **surface** in the Inspector (#314 – the Surface mode's tap, the Tree's Surfaces level, a side in the
   * scene's surfaces): its label as printed, its side, its size (w × h mm), in a free scene its place in the scene (x y z
   * mm, rx ry rz ° – Euler XYZ, `SurfacePlace`; on the stage the Surface tool's gizmo moves or turns it), its **reference
   * image** (editor-only – Library… / Upload…, the fit, remove; `PUT …/surfaces/{id}/reference`), ↑ ↓ in the scene's
   * order and *remove surface* after a confirmation that names what lies on it. Every field saves itself (RULES #37):
   * the surface's fields with the scene's whole list (`PUT …/scenes/{id}`), one autosave subject per scene.
   */
  let { bookId, sceneId, surfaceId }: { bookId: string; sceneId: string; surfaceId: string } = $props();

  const scene = $derived(scenes.scene(sceneId));
  const surface = $derived(scene?.surfaces?.find(s => s.id === surfaceId));
  const index = $derived(scene?.surfaces?.findIndex(s => s.id === surfaceId) ?? -1);
  const free = $derived(scene?.layout === "free");
  const reference = $derived(scenes.reference(sceneId, surfaceId));

  /** What was typed / scrubbed, per surface – a save's answer never writes over it (RULES #37) */
  let draft = $state<SurfaceData | null>(null);
  let shownFor: string | null = null;
  $effect(() => {
    const s = surface;
    const key = `${sceneId}/${surfaceId}`;
    if (!s) return;
    // Another surface starts from its own fields; the same one takes a place the gizmo saved (no field is being typed then)
    if (key !== shownFor || (!autosave.unsaved && JSON.stringify(s.place) !== JSON.stringify(untrack(() => draft?.place)))) {
      shownFor = key;
      untrack(() => (draft = $state.snapshot(s) as SurfaceData));
    }
  });

  const edit = (patch: SurfacePatch) => {
    if (!draft) return;
    draft = updateSurface([draft], draft.id, patch)[0];
    const sceneKey = sceneId;
    const id = surfaceId;
    autosave.queue(`scene:${bookId}:${sceneKey}:surfaces`, async () => {
      const now = scenes.scene(sceneKey)?.surfaces ?? [];
      const next = updateSurface(now, id, patch);
      if (!sameSurfaces(next, now)) await scenes.putScene(sceneKey, { surfaces: next });
    });
  };
  const place = $derived<Required<SurfacePlace>>({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, ...(draft?.place ?? {}) });
  const editPlace = (key: keyof SurfacePlace, value: number) => edit({ place: { ...place, [key]: value } });
  const sides = $derived<string[]>(draft && !(SURFACE_SIDES as readonly string[]).includes(draft.side) ? [...SURFACE_SIDES, draft.side] : [...SURFACE_SIDES]);

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

  // ── the reference image ──
  let picking = $state(false);
  const pick = $derived<LibraryPick | null>(picking
    ? { subject: { for: "surface-reference" }, label: `the reference image of ${surface ? surfaceName(surface) : surfaceId}`, current: reference?.url,
        onpick: asset => { picking = false; void run(() => scenes.putReference(sceneId, surfaceId, { url: asset.url, name: asset.name })); },
        oncancel: () => (picking = false) }
    : null);
  $effect(() => {
    if (library.bookId !== bookId) void library.load(bookId);
  });
  const upload = (file: File) => run(async () => {
    const asset = await library.upload(bookId, file);
    if (asset.kind !== "image") throw new Error(`${asset.name} is no image – it stays in the Library`);
    await scenes.putReference(sceneId, surfaceId, { url: asset.url, name: asset.name });
  });
  const FIT_TITLES: Record<SurfaceReferenceFit, string> = {
    cover: "Cover: fills the surface, the overhang cropped",
    contain: "Contain: the whole image, as large as fits, paper around it",
    stretch: "Stretch: fills the surface as it is",
  };

  let removing = $state(false);
  const warning = $derived(removing ? surfaceRemovalWarning(sceneId, surfaceId) : "");
</script>

{#if pick}
  <LibraryPanel {bookId} {pick} />
{:else if !scene || !surface || !draft}
  <p class="small muted">{scenes.tree ? "This surface is gone." : "Loading the surface…"}</p>
{:else}
  <div class="head">
    <nav class="crumbs" aria-label="Selected level">
      <button type="button" class="crumb" onclick={() => selection.selectSpread()} title="Select the scene">{sceneName(scene)}</button>
      <span class="crumb-sep" aria-hidden="true">›</span>
      <span class="crumb current"><Icon name="surface" size="1em" /> {surfaceName(surface)}</span>
    </nav>
  </div>

  <Section id="surface.fields" label="surface" summary={`${Math.round(draft.widthMm)} × ${Math.round(draft.heightMm)} mm`}
    help="The selected surface of the scene: its label as printed, its side, its size, and in a free scene its place. Every field saves itself.">
    <div class="row" class:changed={(draft.label ?? "") !== (surface.label ?? "")} data-help="The surface's label, written exactly as printed (41, ii, Cover) – none when nothing is printed. The reader shows it where it showed the page number.">
      <span class="label">label</span>
      <input class="field" aria-label="Surface label" placeholder="no label" value={draft.label ?? ""} oninput={e => edit({ label: e.currentTarget.value })} /></div>
    <div class="row" data-help="Which side the surface is known by: a page of a double page (left, right, a fold-out's middle), a cover's front or back, a wall. A target printed on it without the surface's id falls back to this side.">
      <span class="label">side</span>
      <select class="field" aria-label="Surface side" value={draft.side} onchange={e => edit({ side: e.currentTarget.value })}>
        {#each sides as side (side)}<option value={side}>{side}</option>{/each}
      </select></div>
    <div class="row" data-help="The surface's size in millimetres: its width and its height as printed or built.">
      <span class="label">size</span>
      <span class="controls xyz">
        <ScrubNumber value={draft.widthMm} min={1} step={1} unit="mm" prefix="W" label="Surface width" strict onchange={v => edit({ widthMm: v })} />
        <ScrubNumber value={draft.heightMm} min={1} step={1} unit="mm" prefix="H" label="Surface height" strict onchange={v => edit({ heightMm: v })} />
      </span></div>
    <div class="row" data-help="The surface's place in the scene's order: the reader and the fixed row count it.">
      <span class="label">order</span>
      <span class="controls">
        <span class="small muted">{index + 1} of {scene.surfaces?.length ?? 0}</span>
        <button type="button" class="icon-button" disabled={busy || index <= 0} onclick={() => void run(() => moveSceneSurface(sceneId, surfaceId, -1))} title="One place earlier" aria-label="Move up"><Icon name="up" /></button>
        <button type="button" class="icon-button" disabled={busy || index >= (scene.surfaces?.length ?? 0) - 1} onclick={() => void run(() => moveSceneSurface(sceneId, surfaceId, 1))} title="One place later" aria-label="Move down"><Icon name="down" /></button>
      </span></div>
  </Section>

  <Section id="surface.place" label="place" summary={free ? (draft.place ? "placed" : "in the row") : "fixed row"}
    help="Where the surface lies in the scene's coordinate system: mm from the origin (the middle of the first row, on the table; +x right, +y up, +z towards the reader) and its turn in degrees (Euler XYZ – a wall ahead is rx 90). Only a free scene places its surfaces; a fixed one lays them side by side.">
    {#if free}
      <div class="row" data-help="The surface's centre in mm: x to the right, y up from the table, z towards the reader.">
        <span class="label">position</span>
        <span class="controls xyz">
          {#each ["x", "y", "z"] as const as key (key)}
            <ScrubNumber value={place[key]} step={1} unit="mm" prefix={key.toUpperCase()} label="Surface {key}" onchange={v => editPlace(key, v)} />
          {/each}
        </span></div>
      <div class="row" data-help="The surface's turn in degrees, applied about x, then y, then z (Euler XYZ). Unturned it lies flat, face up, its top edge away from the reader; rx 90 stands it up as a wall ahead.">
        <span class="label">rotation</span>
        <span class="controls xyz">
          {#each ["rx", "ry", "rz"] as const as key (key)}
            <ScrubNumber value={place[key]} step={1} unit="°" prefix={key.slice(1).toUpperCase()} label="Surface rotation {key.slice(1)}" onchange={v => editPlace(key, v)} />
          {/each}
        </span></div>
      <div class="row" data-help="What the Surface tool's gizmo on the stage does with the selected surface: move it or turn it. Shift or Ctrl turns snapping around (10 mm, 15°).">
        <span class="label">gizmo</span>
        <span class="controls">
          <Segmented options={SURFACE_GIZMO_MODES} value={surfaceMode.gizmo} label="Surface gizmo" labels={{ translate: "move", rotate: "rotate" }} onchange={mode => (surfaceMode.gizmo = mode)} />
          <span class="small muted">with the Surface tool (S)</span>
        </span></div>
      {#if draft.place}
        <div class="row"><span class="label"></span><button type="button" class="text-link" onclick={() => edit({ place: null })} title="Back to its place in the row of the surfaces without a place">back into the row</button></div>
      {/if}
    {:else}
      <p class="small muted">A fixed scene lays its surfaces side by side as printed together. Make it free to place each surface – a wall standing ahead, a page beside the book.
        <button type="button" class="pill framed" disabled={busy} onclick={() => void run(() => scenes.putScene(sceneId, { layout: "free" }))}>make free</button></p>
    {/if}
  </Section>

  <Section id="surface.reference" label="reference image" summary={reference ? reference.fit : "none"}
    help="A picture the editor's stage lays on the surface – a page's scan, a photo of the wall – to place targets against. Editor-only: never in the reader's content. Library… picks one, Upload adds one, the fit says how it fills the surface, remove takes it away.">
    <div class="row" data-help="The reference image: Library… picks one of the book's images, Upload… adds one. Shown on the stage on this surface.">
      <span class="label">image</span>
      <FileField src={reference?.url} picture empty="none" accept={pickAccept({ for: "surface-reference" })} label="the surface's reference image"
        onlibrary={() => (picking = true)} onupload={f => void upload(f)} /></div>
    {#if reference}
      <div class="row" data-help="How the image fills the surface: cover crops the overhang, contain shows it whole, stretch fills it as it is.">
        <span class="label">fit</span>
        <span class="controls">
          <Segmented options={REFERENCE_FITS} value={reference.fit} label="Reference fit" titles={FIT_TITLES}
            onchange={fit => void run(() => scenes.putReference(sceneId, surfaceId, { fit }))} />
          <button type="button" class="text-link" disabled={busy} onclick={() => void run(() => scenes.putReference(sceneId, surfaceId, { url: null }))}>remove</button>
        </span></div>
    {/if}
  </Section>

  <div class="row remove">
    <span class="label"></span>
    {#if removing}
      <p class="small confirm">Remove the surface {surfaceName(surface)}? {warning || "Nothing lies on it."} Its reference image goes with it.
        <button type="button" class="pill framed danger" disabled={busy} onclick={() => void run(() => removeSceneSurface(sceneId, surfaceId))}>remove</button>
        <button type="button" class="pill" onclick={() => (removing = false)}>keep</button></p>
    {:else}
      <button type="button" class="text-link" onclick={() => (removing = true)} title="Remove the surface from the scene – asks first">remove surface</button>
    {/if}
  </div>
  {#if error}<p class="small danger">{error}</p>{/if}
{/if}

<style>
  .head { display: flex; align-items: center; gap: .25rem; min-height: var(--control-height); }
  .crumbs { display: flex; align-items: center; gap: .25rem; min-width: 0; }
  .crumb { padding: 0; border: none; background: none; color: var(--muted); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crumb.current { color: var(--text); cursor: default; display: inline-flex; align-items: center; gap: .25rem; }
  .crumb-sep { color: var(--muted); }
  .xyz { display: flex; gap: .125rem; flex: 1; min-width: 0; }
  .xyz :global(.scrub) { flex: 1; min-width: 0; }
  .confirm { margin: .125rem 0; }
  .confirm .pill { margin-left: .25rem; }
  .remove { margin-top: .25rem; }
</style>
