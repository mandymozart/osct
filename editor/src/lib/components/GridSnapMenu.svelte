<script lang="ts">
  import { onMount } from "svelte";
  import Segmented from "./Segmented.svelte";
  import ScrubNumber from "./ScrubNumber.svelte";
  import ToolMenu from "./ToolMenu.svelte";
  import { clampGrid, getPreview, subscribePreview, updatePreview, type PreviewState } from "#lib/stage/preview.js";
  import { clampSnap, SNAP_LIMITS, SNAP_TARGETS, toggleSnapTarget, type SnapTarget } from "#lib/stage/snap.js";

  /**
   * The stage toolbar's **grid & snap** group (#190), built like the toolbar's other groups (#180): one button (the grid's icon; a dot in its
   * corner while snapping is on) opening a panel attached to it (`ToolMenu`) with the grid's visibility and step, the
   * vertical axis, snapping on / off, what a move snaps to and the precision per gizmo mode – the preview settings,
   * stored in this browser (`stage/preview.ts`).
   */
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  const TARGET_HELP: Record<SnapTarget, string> = {
    grid: "The grid: a move steps by the grid's spacing, counted from the origin (off: by the move step).",
    axes: "The axes: the origin's zero lines on the page and the page itself for the height.",
    objects: "Other objects: their boxes' edges and centres, and their pivots.",
    outlines: "Outlines: the printed targets' edges and centres and the pages' edges.",
  };

  const toggle = (target: SnapTarget) => updatePreview({ snapTo: toggleSnapTarget(preview.snapTo, target) });
</script>

<ToolMenu label="Grid and snap" icon="grid" marked={preview.snap}
  title="Grid and snap: snap {preview.snap ? 'on' : 'off'}, grid {preview.grid ? `${preview.gridMm} mm` : 'off'} – tap for the settings; Shift or Ctrl while dragging turns snapping around"
  buttonLabel="Grid and snap: snap {preview.snap ? 'on' : 'off'}">
  <div class="row" data-help="A grid over the page: on / off and its spacing in mm. Its lines run through the origin, which is drawn red.">
    <span class="label">grid</span>
    <span class="controls">
      <Segmented options={["off", "on"] as const} value={preview.grid ? "on" : "off"} onchange={v => updatePreview({ grid: v === "on" })} />
      <span class="w"><ScrubNumber value={preview.gridMm} min={1} max={500} step={1} fallback={10} strict unit="mm" label="Grid spacing" oninput={gridMm => updatePreview({ gridMm: clampGrid(gridMm) })} /></span>
    </span>
  </div>
  <div class="row" data-help="The vertical axis: a thin green line for the height, rising from the origin out of the page. It shows with the grid.">
    <span class="label">vertical axis</span>
    <span class="controls"><Segmented options={["off", "on"] as const} value={preview.axis ? "on" : "off"} onchange={v => updatePreview({ axis: v === "on" })} /></span>
  </div>
  <div class="row rule" data-help="Snapping for the gizmo (move, rotate, scale) and the placement handles. Holding Shift or Ctrl while dragging turns it around for that drag; with a finger this switch is the way.">
    <span class="label">snap</span>
    <span class="controls"><Segmented options={["off", "on"] as const} value={preview.snap ? "on" : "off"} onchange={v => updatePreview({ snap: v === "on" })} /></span>
  </div>
  <div class="row" data-help="What a move snaps to; the nearest within a few pixels wins, the grid (or the move step) when nothing is near.">
    <span class="label">snap to</span>
    <span class="controls">
      {#each SNAP_TARGETS as target (target)}
        <button type="button" class="pill" class:on={preview.snapTo.includes(target)} aria-pressed={preview.snapTo.includes(target)} data-help={TARGET_HELP[target]}
          onclick={() => toggle(target)}>{target}</button>
      {/each}
    </span>
  </div>
  <div class="row" data-help="Move: the step in mm a move rounds to while the grid is no snap target.">
    <span class="label">move</span>
    <span class="controls"><span class="w"><ScrubNumber value={preview.snapMove} min={SNAP_LIMITS.move.min} max={SNAP_LIMITS.move.max} step={0.5} fallback={1} strict unit="mm"
      label="Move step" oninput={v => updatePreview({ snapMove: clampSnap("move", v) })} /></span></span>
  </div>
  <div class="row" data-help="Rotate: a rotation turns in whole steps of these degrees.">
    <span class="label">rotate</span>
    <span class="controls"><span class="w"><ScrubNumber value={preview.snapRotate} min={SNAP_LIMITS.rotate.min} max={SNAP_LIMITS.rotate.max} step={1} fallback={15} strict unit="°"
      label="Rotate step" oninput={v => updatePreview({ snapRotate: clampSnap("rotate", v) })} /></span></span>
  </div>
  <div class="row" data-help="Scale: a scale changes in whole steps of this factor, never below one step.">
    <span class="label">scale</span>
    <span class="controls"><span class="w"><ScrubNumber value={preview.snapScale} min={SNAP_LIMITS.scale.min} max={SNAP_LIMITS.scale.max} step={0.01} fallback={0.1} strict
      label="Scale step" oninput={v => updatePreview({ snapScale: clampSnap("scale", v) })} /></span></span>
  </div>
</ToolMenu>

<style>
  .w { width: 5rem; display: inline-flex; }
</style>
