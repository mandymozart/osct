<script lang="ts">
  import { onMount } from "svelte";
  import Toggle from "./Toggle.svelte";
  import ScrubNumber from "./ScrubNumber.svelte";
  import ToolMenu from "./ToolMenu.svelte";
  import { clampFloorGrid, clampGrid, clampWallZ, getPreview, subscribePreview, updatePreview, type PreviewState } from "#lib/stage/preview.js";
  import { clampSnap, SNAP_LIMITS, SNAP_TARGETS, toggleSnapTarget, type SnapTarget } from "#lib/stage/snap.js";

  /**
   * The stage toolbar's **grid & snap** group (#190), built like the toolbar's other groups (#180): one button (the grid's icon; a dot in its
   * corner while snapping is on) opening a panel attached to it (`ToolMenu`) with the surfaces' grid (visibility and
   * step – a surface may have its own, the Inspector's surface), the vertical axis, the scene's **floor grid** (on y = 0,
   * the snap grid of the surfaces' places), the **vertical grid** (a plane at a chosen z, for wall setups), snapping on / off, what a move snaps to and the precision per gizmo mode – the preview settings,
   * stored in this browser (`stage/preview.ts`).
   */
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  const TARGET_HELP: Record<SnapTarget, string> = {
    grid: "The grid: a move steps by the grid's spacing, counted from the origin (off: by the move step).",
    axes: "The axes: the origin's zero lines on the surface and the surface itself for the height.",
    objects: "Other objects: their boxes' edges and centres, and their pivots.",
    outlines: "Outlines: the printed targets' edges and centres and the surfaces' edges.",
  };

  const toggle = (target: SnapTarget) => updatePreview({ snapTo: toggleSnapTarget(preview.snapTo, target) });
</script>

<ToolMenu label="Grid and snap" icon="grid" marked={preview.snap}
  title="Grid and snap: snap {preview.snap ? 'on' : 'off'}, surface grid {preview.grid ? `${preview.gridMm} mm` : 'off'}, floor grid {preview.floorGrid ? `${preview.floorMm} mm` : 'off'}{preview.wallGrid ? `, vertical grid at z ${preview.wallZ} mm` : ''} – tap for the settings; Shift or Ctrl while dragging turns snapping around"
  buttonLabel="Grid and snap: snap {preview.snap ? 'on' : 'off'}">
  <div class="row" data-help="The surfaces' grid for the targets on them: on / off and its spacing in mm (a surface may have its own – the Inspector's surface). Its lines run through the origin, which is drawn red.">
    <span class="label">surface grid</span>
    <span class="controls">
      <Toggle on={preview.grid} label="Grid" onchange={grid => updatePreview({ grid })} />
      <span class="w"><ScrubNumber value={preview.gridMm} min={1} max={500} step={1} fallback={10} strict unit="mm" label="Grid spacing" oninput={gridMm => updatePreview({ gridMm: clampGrid(gridMm) })} /></span>
    </span>
  </div>
  <div class="row" data-help="The vertical axis: a thin green line for the height, rising from the origin out of the surface – and the scene's axes at its origin (x red, y up green, z towards the reader blue).">
    <span class="label">vertical axis</span>
    <span class="controls"><Toggle on={preview.axis} label="Vertical axis" onchange={axis => updatePreview({ axis })} /></span>
  </div>
  <div class="row rule" data-help="The scene's floor grid: a transparent net on the table (the scene's y = 0) through the origin, every tenth line stronger – the snap grid of the surfaces' places: the Surface tool's gizmo steps by its spacing while snapping is on.">
    <span class="label">floor grid</span>
    <span class="controls">
      <Toggle on={preview.floorGrid} label="Floor grid" onchange={floorGrid => updatePreview({ floorGrid })} />
      <span class="w"><ScrubNumber value={preview.floorMm} min={1} max={1000} step={5} fallback={50} strict unit="mm" label="Floor grid spacing" oninput={floorMm => updatePreview({ floorMm: clampFloorGrid(floorMm) })} /></span>
    </span>
  </div>
  <div class="row" data-help="The vertical grid for wall setups: the floor grid's net standing up at the scene's z (mm from the origin, + towards the reader – a wall ahead is at a negative z).">
    <span class="label">vertical grid</span>
    <span class="controls">
      <Toggle on={preview.wallGrid} label="Vertical grid" onchange={wallGrid => updatePreview({ wallGrid })} />
      <span class="w"><ScrubNumber value={preview.wallZ} min={-10000} max={10000} step={10} fallback={-500} strict unit="mm" prefix="Z" label="Vertical grid z" oninput={wallZ => updatePreview({ wallZ: clampWallZ(wallZ) })} /></span>
    </span>
  </div>
  <div class="row rule" data-help="Snapping for the gizmo (move, rotate, scale) and the placement handles. Holding Shift or Ctrl while dragging turns it around for that drag; with a finger this switch is the way.">
    <span class="label">snap</span>
    <span class="controls"><Toggle on={preview.snap} label="Snap" onchange={snap => updatePreview({ snap })} /></span>
  </div>
  <!-- What a move snaps to: one switch per target (#241), the nearest within a few pixels wins, the grid (or the move step) when nothing is near -->
  {#each SNAP_TARGETS as target (target)}
    <div class="row" data-help={TARGET_HELP[target]}>
      <span class="label">snap to {target}</span>
      <span class="controls"><Toggle on={preview.snapTo.includes(target)} label="Snap to {target}" onchange={() => toggle(target)} /></span>
    </div>
  {/each}
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
