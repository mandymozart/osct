<script lang="ts">
  import { SvelteFlow, Controls, MarkerType, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/base.css";
  import type { Flow, FlowBox } from "#lib/logic/flow.js";
  import LogicBox, { type LogicBoxData } from "./LogicBox.svelte";

  /**
   * The Logic panel's canvas (#334 L-T3): `@xyflow/svelte` as the **rendering layer only** (decision L7) – the boxes, their
   * ports and the wires come from `logic/flow.ts`, which has them from the level's `View` and `logic/layout.ts`; xyflow
   * pans, zooms and fits, and owns nothing: no drag, no connect, no delete (editing comes as ops with L-T4). The panel
   * imports this component lazily, so the editor's first load does not carry xyflow. A wire's signal is its dash, never a
   * colour (RULES #38); a wire that never fires (an event between two scenes) is dotted and thin.
   */
  let { flow, level, selected, flash, onpick, onenter }: {
    flow: Flow;
    /** The level's key: a new level fits the view again */
    level: string;
    selected: (box: FlowBox) => boolean;
    flash: string | null;
    onpick: (box: FlowBox) => void;
    onenter: (box: FlowBox) => void;
  } = $props();

  let hovered = $state<string | null>(null);
  // Another level: nothing is lit (the box under the pointer went away without a leave)
  $effect.pre(() => {
    void level;
    hovered = null;
  });
  const nodeTypes = { logic: LogicBox };

  // A box hovered on the level before (it went away under the pointer) lights nothing here
  const lit = $derived(hovered && flow.boxes.some(b => b.id === hovered) ? new Set(flow.wires.filter(w => w.source === hovered || w.target === hovered).flatMap(w => [w.source, w.target])) : null);

  let nodes = $state.raw<Node<LogicBoxData>[]>([]);
  let edges = $state.raw<Edge[]>([]);
  // Before the DOM: a new level's canvas mounts with its own boxes, so it fits them
  $effect.pre(() => {
    const neverBox = new Set(flow.wires.filter(w => w.never).flatMap(w => [w.source, w.target].filter(id => id.startsWith("stub:"))));
    nodes = flow.boxes.map(box => ({
      id: box.id, type: "logic", position: { x: box.x, y: box.y }, draggable: false, connectable: false, selectable: false,
      data: { box, selected: selected(box), flash: flash === box.id, dim: !!lit && !lit.has(box.id), never: neverBox.has(box.id), onpick, onenter },
    }));
    edges = flow.wires.map(w => ({
      id: w.id, source: w.source, target: w.target, sourceHandle: w.sourcePort, targetHandle: w.targetPort, label: w.never ? `${w.label} · never fires` : w.label,
      selectable: false, focusable: false, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      class: ["logic-wire", `sig-${w.signal}`, w.never && "never", w.back && "back", lit && (lit.has(w.source) && lit.has(w.target) && (w.source === hovered || w.target === hovered) ? "lit" : "dim")],
    }));
  });
</script>

<div class="flow" role="presentation" onpointerleave={() => (hovered = null)}>
  {#key level}
    <SvelteFlow bind:nodes bind:edges {nodeTypes} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }} minZoom={0.1} maxZoom={2}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}
      onnodeclick={({ node }) => onpick((node.data as LogicBoxData).box)}
      onnodepointerenter={({ node }) => (hovered = node.id)} onnodepointerleave={({ node }) => { if (hovered === node.id) hovered = null; }}>
      <Controls showLock={false} position="bottom-right" />
    </SvelteFlow>
  {/key}
</div>

<style>
  .flow { position: relative; flex: 1; min-height: 8rem; }
  .flow :global(.svelte-flow) {
    --xy-background-color: transparent; --xy-edge-stroke: var(--muted); --xy-edge-stroke-width: 1.25; --xy-handle-background-color: var(--surface);
    --xy-edge-label-background-color: var(--surface); --xy-edge-label-color: var(--muted); --xy-controls-button-background-color: var(--surface);
    --xy-controls-button-background-color-hover: var(--hover-background); --xy-controls-button-color: var(--text); --xy-controls-button-border-color: var(--line);
    font-family: var(--font);
  }
  .flow :global(.svelte-flow__node) { cursor: pointer; }
  /* The signal by dash: event solid, value dashed, node dotted, scene / address dash-dot (DESIGN.md has no signal colours, L-T8) */
  .flow :global(.logic-wire.sig-value path.svelte-flow__edge-path) { stroke-dasharray: 6 3; }
  .flow :global(.logic-wire.sig-node path.svelte-flow__edge-path) { stroke-dasharray: 1.5 2.5; }
  .flow :global(.logic-wire.sig-scene path.svelte-flow__edge-path), .flow :global(.logic-wire.sig-address path.svelte-flow__edge-path) { stroke-dasharray: 8 3 2 3; }
  .flow :global(.logic-wire.never path.svelte-flow__edge-path) { stroke-dasharray: 1 4; stroke-width: 1; }
  .flow :global(.logic-wire.lit path.svelte-flow__edge-path) { stroke: var(--text); stroke-width: 2; }
  .flow :global(.logic-wire.dim) { opacity: .25; }
  .flow :global(.svelte-flow__edge-label) { font-size: .625rem; padding: 0 .125rem; }
  .flow :global(.svelte-flow__arrowhead polyline) { stroke: var(--muted) !important; fill: var(--muted) !important; }
</style>
