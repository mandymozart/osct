<script lang="ts">
  import { onMount, tick } from "svelte";
  import Icon from "./Icon.svelte";
  import Segmented from "./Segmented.svelte";
  import ScrubNumber from "./ScrubNumber.svelte";
  import { menuStep } from "#lib/tool-groups.js";
  import { clampGrid, getPreview, subscribePreview, updatePreview, type PreviewState } from "#lib/stage/preview.js";
  import { clampSnap, SNAP_LIMITS, SNAP_TARGETS, toggleSnapTarget, type SnapTarget } from "#lib/stage/snap.js";

  /**
   * The stage toolbar's **grid & snap** group (#190), after #180's groups: one button (the grid's icon; a dot in its
   * corner while snapping is on) opening a menu attached to it with the grid's visibility and step, the vertical axis,
   * snapping on / off, what a move snaps to and the precision per gizmo mode – the preview settings, stored in this
   * browser (`stage/preview.ts`). Its controls are the panels' (Segmented, pressed pills, ScrubNumber), with the touch
   * height on a finger. ↓ / ↑ on the button opens it on its first control; ↑ ↓ (Home / End) move between its buttons,
   * Esc closes and returns the focus to the button, Tab out of it or a tap outside closes it (the backdrop takes the tap,
   * so it picks nothing on the stage). Fixed to the screen, kept on it.
   */
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  const TARGET_HELP: Record<SnapTarget, string> = {
    grid: "The grid: a move steps by the grid's spacing, counted from the origin (off: by the move step).",
    axes: "The axes: the origin's zero lines on the page and the page itself for the height.",
    objects: "Other objects: their boxes' edges and centres, and their pivots.",
    outlines: "Outlines: the printed targets' edges and centres and the pages' edges.",
  };

  const menuId = `grid-snap-${Math.random().toString(36).slice(2, 9)}`;
  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let at = $state({ left: 0, top: 0 });

  /** The menu's buttons and fields, in order (the arrows move between its buttons) */
  const focusables = (): HTMLElement[] => (menu ? [...menu.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")] : []);

  const show = async () => {
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    at = { left: r.left, top: r.bottom + 2 };
    open = true;
    await tick();
    if (menu) {
      const m = menu.getBoundingClientRect();
      const left = Math.max(4, Math.min(r.left, window.innerWidth - m.width - 4));
      const top = r.bottom + 2 + m.height > window.innerHeight - 4 ? Math.max(4, r.top - 2 - m.height) : r.bottom + 2;
      at = { left, top };
    }
    focusables()[0]?.focus();
  };
  const close = (refocus: boolean) => {
    open = false;
    if (refocus) trigger?.focus();
  };
  // A tap anywhere the backdrop does not reach (the top bar) closes it too
  $effect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target && (menu?.contains(target) || trigger?.contains(target) || target.classList.contains("backdrop"))) return;
      close(false);
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  });
  const triggerKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    void show();
  };
  const menuKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    // A number field keeps its own keys (↑ ↓ step it, ← → move the caret)
    if ((event.target as HTMLElement).tagName === "INPUT") {
      event.stopPropagation(); // not the spreads' ← →
      return;
    }
    const all = focusables().filter(el => el.tagName === "BUTTON");
    const index = all.indexOf(document.activeElement as HTMLElement);
    const key = event.key === "ArrowLeft" || event.key === "ArrowRight" ? null : event.key;
    const next = key ? menuStep(key, index < 0 ? 0 : index, all.length) : null;
    event.stopPropagation(); // not the spreads' ← →
    if (next === null) return;
    event.preventDefault();
    all[next]?.focus();
  };
  /** Tab out of the menu closes it */
  const menuFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && !menu?.contains(next) && next !== trigger) close(false);
  };
  const toggle = (target: SnapTarget) => updatePreview({ snapTo: toggleSnapTarget(preview.snapTo, target) });
</script>

<svelte:window onresize={() => { if (open) close(false); }} />

<span class="tool-group" role="group" aria-label="Grid and snap">
  <button bind:this={trigger} type="button" class="icon-button group-button" class:open class:snapping={preview.snap} aria-haspopup="dialog" aria-expanded={open}
    aria-controls={open ? menuId : undefined} title="Grid and snap: snap {preview.snap ? 'on' : 'off'}, grid {preview.grid ? `${preview.gridMm} mm` : 'off'} – tap for the settings; Shift or Ctrl while dragging turns snapping around"
    aria-label="Grid and snap: snap {preview.snap ? 'on' : 'off'}" onclick={() => (open ? close(false) : void show())} onkeydown={triggerKey}>
    <Icon name="grid" stroke={2} />
  </button>
  {#if open}
    <button type="button" class="backdrop" tabindex="-1" aria-label="Close the menu" onclick={() => close(false)}></button>
    <div bind:this={menu} id={menuId} class="flyout" role="dialog" aria-label="Grid and snap" tabindex="-1" style:left="{at.left}px" style:top="{at.top}px"
      onkeydown={menuKey} onfocusout={menuFocusOut}>
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
    </div>
  {/if}
</span>

<style>
  .tool-group { flex: none; display: inline-flex; align-items: center; }
  .group-button { position: relative; }
  .group-button::after { content: ""; position: absolute; right: 2px; bottom: 2px; border: 2.5px solid transparent; border-right-color: var(--muted); border-bottom-color: var(--muted); }
  .group-button.snapping::before { content: ""; position: absolute; right: 3px; top: 3px; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .group-button.open { background: var(--pressed-background); color: var(--pressed-color); }
  .backdrop { position: fixed; inset: 0; z-index: 9; border: none; background: none; padding: 0; cursor: default; }
  .flyout { position: fixed; z-index: 10; display: flex; flex-direction: column; width: max-content; max-width: calc(100vw - .5rem); padding: .25rem .5rem; border: 1px solid var(--line);
    border-radius: var(--control-radius); background: var(--surface); color: var(--text); outline: none; }
  .flyout .row { grid-template-columns: 6rem minmax(0, 1fr); }
  .flyout .rule { margin-top: .25rem; padding-top: .25rem; border-top: 1px solid var(--line); }
  .w { width: 5rem; display: inline-flex; }
</style>
