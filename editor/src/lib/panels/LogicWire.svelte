<script lang="ts" module>
  import type { DeckSignal } from "#lib/logic/signals.js";

  /** What the canvas hands a wire (`LogicCanvas.svelte`) */
  export interface LogicWireData extends Record<string, unknown> {
    /** The view's edge it draws (what an op names) */
    edge: string;
    deck: DeckSignal;
    never: boolean;
    /** Live feedback (#334): the pulse's number while the stage just lit it (a new number starts the glow again), 0: not lit */
    live?: number;
  }
</script>

<script lang="ts">
  import { BaseEdge, type EdgeProps } from "@xyflow/svelte";
  import { SIGNAL_STYLES, hangPath, signalToken } from "#lib/logic/signals.js";

  /**
   * A wire of the Logic canvas (#334 L-T7, L-T8) as the SCUTOONS deck hangs one (deck-kit `Wire::hang`): a cubic that sags
   * under its ends (0.35rem plus a tenth of their distance), in its signal's colour at 85 %, 1.4 × its signal's weight wide
   * (an event's heavier); hovered, a halo five times as wide at 18 %; selected, the halo in the deck's accent. A wire that
   * never fires (an event between two scenes) is dotted and thin. Its label sits at its lowest point, in its signal's colour
   * with an outline in the canvas's background (Tilman, 2026-11-21: "values on wires need an outline so they stick out
   * more") – `LogicCanvas.svelte` styles it.
   *
   * **Trace** (#334): while the stage just lit it (`data.live`), a glow in its own colour runs once along it from its source to
   * its target (a dash travelling on `pathLength` 100) over a wider halo that fades out in a second; a new firing starts it
   * again. With reduced motion, only the halo – no movement, no fade.
   */
  let { id, sourceX, sourceY, targetX, targetY, label, data, selected }: EdgeProps & { data?: LogicWireData } = $props();

  const deck = $derived(data?.deck ?? "event");
  const width = $derived(data?.never ? 1 : 1.4 * SIGNAL_STYLES[deck].weight);
  /* A wire's word is ringed in white (#334): in its signal's colour – but the event signal is near white at night, so its
     word takes the event's day ink, dark in both themes, in a white ring; the other words' ring is the theme's
     `--wire-halo` – white round the day's dark inks, dark round the night's bright ones */
  const labelInk = $derived(deck === "event" ? SIGNAL_STYLES.event.day : `var(${signalToken(deck)})`);
  const wire = $derived(hangPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }));
</script>

<path class="halo" class:selected d={wire.d} style:stroke-width="{width * 5}px" style:--wire="var({signalToken(deck)})" />
<BaseEdge {id} path={wire.d} labelX={wire.x} labelY={wire.y} {label} labelStyle="--wire-label: {labelInk};{deck === 'event' ? ' --wire-halo-ink: #fff;' : ''}"
  style="stroke: var({signalToken(deck)}); stroke-width: {width}px; stroke-opacity: .85;{data?.never ? ' stroke-dasharray: 1 4;' : ''}" />
{#if data?.live}
  {#key data.live}
    <path class="live-halo" d={wire.d} style:stroke-width="{width * 4}px" style:--wire="var({signalToken(deck)})" />
    <path class="live-run" d={wire.d} pathLength="100" style:stroke-width="{width * 2.2}px" style:--wire="var({signalToken(deck)})" />
  {/key}
{/if}

<style>
  .halo { fill: none; stroke: var(--wire); stroke-opacity: 0; stroke-linecap: round; pointer-events: none; }
  @media (hover: hover) {
    :global(.svelte-flow__edge:hover) .halo { stroke-opacity: .18; }
  }
  .halo.selected { stroke: var(--signal-accent); stroke-opacity: .45; }
  .live-halo, .live-run { fill: none; stroke: var(--wire); stroke-linecap: round; pointer-events: none; }
  .live-halo { stroke-opacity: .3; animation: live-fade 1s ease-out forwards; }
  .live-run { stroke-dasharray: 14 200; stroke-dashoffset: 14; filter: drop-shadow(0 0 3px var(--wire)); animation: live-run .9s ease-in-out forwards; }
  @keyframes live-fade { from { stroke-opacity: .35; } to { stroke-opacity: 0; } }
  @keyframes live-run {
    from { stroke-dashoffset: 14; opacity: 1; }
    80% { opacity: 1; }
    to { stroke-dashoffset: -100; opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-run { display: none; }
    .live-halo { animation: none; }
  }
</style>
