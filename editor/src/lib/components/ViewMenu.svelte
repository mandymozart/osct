<script lang="ts">
  import { onMount } from "svelte";
  import Segmented from "./Segmented.svelte";
  import ScrubNumber from "./ScrubNumber.svelte";
  import ToolMenu from "./ToolMenu.svelte";
  import { getPreview, HDRIS, isHdriId, subscribePreview, TOPS, updatePreview, viewSummary, type PreviewState } from "#lib/stage/preview.js";
  import { isOriginId, ORIGIN_SPOTS, ORIGINS, originHelp, originLabel, type OriginFrame } from "#lib/stage/origin.js";
  import { stageEnvironment } from "#lib/environment.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { environmentSkyLabel } from "#lib/stage/sky.js";

  /**
   * The stage toolbar's **view** group (#229 – the Stage tab's *stage* section until then), next to *grid & snap*: one
   * button (`ToolMenu`, the gear) opening a panel with how the editor shows the spread – the hand shake, the origin
   * every x / y is counted from (a 3 × 3 alignment square), the desk's top and the sky (the studio HDRI; with the book's
   * environment its world is the sky and the HDRI waits for a book without one, #185). Stored in this browser, not in
   * the content (`stage/preview.ts`); the button's tooltip is `viewSummary`. `open()` opens it from the stage's menu.
   */
  let { format = "spread" }: {
    /** The spread's format: a cover's centre is the page's, not the book's */
    format?: OriginFrame["format"];
  } = $props();

  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  /** The book's environment replaces the HDRI as the sky (#185): the picker says so and stays for books without one */
  const environment = $derived(stageEnvironment.current);
  const summary = $derived(viewSummary(preview, { format, environment: !!environment }));

  let menu = $state<{ open: () => Promise<void> }>();
  /** Open the panel (the stage's menu: *View settings…*) */
  export const open = (): void => void menu?.open();
</script>

<ToolMenu bind:this={menu} label="View" icon="settings" title="View: {summary} – tap for the settings, stored in this browser" buttonLabel="View: {summary}">
  <div class="row" data-help="Hand shake: 0 = still, 1 = a hand holding the phone. The stage wobbles like a reader's camera.">
    <span class="label">shake</span>
    <span class="controls"><span class="w"><ScrubNumber value={preview.wobble} min={0} max={1} step={0.05} fallback={0} strict label="Hand shake" oninput={wobble => updatePreview({ wobble })} /></span></span>
  </div>

  <div class="row" data-help="Where the grid and every x / y in the editor count from – a point of the alignment square: a corner or an edge's centre of the page a position lies on, or the centre (the book's centre, the spine's middle, on the open book; the page's centre on a cover). x runs to the right, y downwards; left of or above the origin is negative. Saved positions stay mm from the page's top left. Now: {originHelp(preview.origin, format)}">
    <span class="label">origin</span>
    <span class="controls">
      <span class="origin" role="radiogroup" aria-label="Origin">
        {#each ORIGINS as origin (origin)}
          <button type="button" role="radio" class="spot" class:on={preview.origin === origin} aria-checked={preview.origin === origin} aria-label={originLabel(origin, format)}
            data-help={originHelp(origin, format)} style:grid-column={ORIGIN_SPOTS[origin].col + 1} style:grid-row={ORIGIN_SPOTS[origin].row + 1}
            onclick={() => { if (isOriginId(origin)) updatePreview({ origin }); }}></button>
        {/each}
      </span>
      <span class="small">{originLabel(preview.origin, format)}</span>
    </span>
  </div>

  <div class="row rule" data-help="The top of the desk the book lies on (Eiermann's steel frame): its screen-printed plywood, or blue-grey linoleum on oak plywood. Only the top changes – the book, the targets and the camera stay where they are.">
    <span class="label">top</span>
    <span class="controls">
      <Segmented options={TOPS.map(t => t.id)} value={preview.top} label="Desk top" onchange={top => updatePreview({ top })} />
    </span>
  </div>

  {#if environment}
    <div class="row" data-help="The sky: the book's environment (the Environment tab) – while rendered its world replaces the HDRI, and the scene's own lights light the stage, as in the reader.">
      <span class="label">sky</span>
      <span class="controls"><span class="small sky">{environmentSkyLabel(environment, url => library.byUrl(url)?.name)}</span></span>
    </div>
  {/if}
  <div class="row" data-help={environment
    ? "The studio HDRI – overridden by the book's environment, used again for a book without one (Environment tab → Use the default)."
    : "The sky and its light: a studio HDRI, shown while the shading is rendered. A book's environment replaces it (the Environment tab)."}>
    <span class="label">{environment ? "HDRI" : "sky"}</span>
    <span class="controls">
      <select class="field" class:overridden={!!environment} aria-label="HDRI" value={preview.hdri} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (isHdriId(id)) updatePreview({ hdri: id }); }}>
        {#each HDRIS as hdri (hdri.id)}<option value={hdri.id}>{hdri.name}</option>{/each}
      </select>
      {#if environment}<span class="small muted">without an environment</span>{/if}
    </span>
  </div>
</ToolMenu>

<style>
  .w { width: 5rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .overridden { opacity: .6; }
  .sky { max-width: 14rem; overflow-wrap: anywhere; }
  .origin { display: inline-grid; grid-template-columns: repeat(3, .75rem); grid-template-rows: repeat(3, .75rem); gap: .125rem; padding: .125rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--control-background); }
  .spot { width: .75rem; height: .75rem; padding: 0; border: 1px solid var(--muted); border-radius: 50%; background: none; cursor: pointer; }
  @media (hover: hover) {
    .spot:hover { border-color: var(--text); }
  }
  .spot.on { border-color: var(--text); background: var(--text); }
  /* A finger: a bigger cell to hit, the drawn dot keeps its size */
  @media (pointer: coarse) {
    .origin { grid-template-columns: repeat(3, 1.75rem); grid-template-rows: repeat(3, 1.75rem); }
    .spot { position: relative; width: 1.75rem; height: 1.75rem; border: none; border-radius: 0; }
    .spot::before { content: ""; position: absolute; inset: calc(50% - .375rem); border: 1px solid var(--muted); border-radius: 50%; }
    .spot.on { background: none; }
    .spot.on::before { border-color: var(--text); background: var(--text); }
  }
</style>
