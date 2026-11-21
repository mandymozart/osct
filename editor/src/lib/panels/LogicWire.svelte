<script lang="ts" module>
  import type { DeckSignal } from "#lib/logic/signals.js";

  /** What the canvas hands a wire (`LogicCanvas.svelte`) */
  export interface LogicWireData extends Record<string, unknown> {
    /** The view's edge it draws (what an op names) */
    edge: string;
    deck: DeckSignal;
    never: boolean;
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
   */
  let { id, sourceX, sourceY, targetX, targetY, label, data, selected }: EdgeProps & { data?: LogicWireData } = $props();

  const deck = $derived(data?.deck ?? "event");
  const width = $derived(data?.never ? 1 : 1.4 * SIGNAL_STYLES[deck].weight);
  const wire = $derived(hangPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }));
</script>

<path class="halo" class:selected d={wire.d} style:stroke-width="{width * 5}px" style:--wire="var({signalToken(deck)})" />
<BaseEdge {id} path={wire.d} labelX={wire.x} labelY={wire.y} {label} labelStyle="--wire-label: var({signalToken(deck)})"
  style="stroke: var({signalToken(deck)}); stroke-width: {width}px; stroke-opacity: .85;{data?.never ? ' stroke-dasharray: 1 4;' : ''}" />

<style>
  .halo { fill: none; stroke: var(--wire); stroke-opacity: 0; stroke-linecap: round; pointer-events: none; }
  @media (hover: hover) {
    :global(.svelte-flow__edge:hover) .halo { stroke-opacity: .18; }
  }
  .halo.selected { stroke: var(--signal-accent); stroke-opacity: .45; }
</style>
