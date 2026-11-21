<script lang="ts">
  import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/svelte";

  /**
   * A reference line of the Logic canvas (#334, Tilman 2026-11-21): from a plugin's display row (what its code reads, sets,
   * drives) to the box it names. Not a wire – a code fact no wire can change: thin, muted, dotted (`2 4`), no label, and it
   * takes no pointer (nothing selects, deletes or lights it).
   */
  let { id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }: EdgeProps = $props();

  const path = $derived(getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0]);
</script>

<BaseEdge {id} {path} interactionWidth={0} style="stroke: var(--muted); stroke-width: 1px; stroke-opacity: .9; stroke-dasharray: 2 4;" />
