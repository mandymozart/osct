<script lang="ts" module>
  /** A gesture's target on the canvas: a box, a wire (by the view's edge id) or the empty canvas */
  export type CanvasTarget = { kind: "box"; box: import("#lib/logic/flow.js").FlowBox } | { kind: "wire"; edge: string; label: string } | { kind: "pane" };
</script>

<script lang="ts">
  import { SvelteFlow, Controls, MarkerType, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/base.css";
  import type { Flow, FlowBox } from "#lib/logic/flow.js";
  import LogicBox, { type LogicBoxData } from "./LogicBox.svelte";

  /**
   * The Logic panel's canvas (#334 L-T3, L-T4): `@xyflow/svelte` as the **rendering layer only** (decision L7) – the boxes,
   * their ports and the wires come from `logic/flow.ts`, which has them from the level's `View` and `logic/layout.ts`; xyflow
   * pans, zooms and fits, and **reports gestures, owning nothing**: a drag from a port to a port (`onconnect`), Delete on a
   * selected wire or box (`ondelete`), a right click (`onmenu`). The panel turns them into ops (`logic/apply.ts`); xyflow never
   * adds or removes an edge or a node itself – its own connect and delete are refused, the documents come back as a new
   * flow. While `editable` is off (the experience and group levels, another scene) nothing connects, is selected or deleted.
   * The panel imports this component lazily, so the editor's first load does not carry xyflow. A wire's signal is its dash,
   * never a colour (RULES #38); a wire that never fires (an event between two scenes) is dotted and thin.
   */
  let { flow, level, selected, flash, editable, onpick, onenter, canconnect, onconnect, ondelete, onselect, onmenu }: {
    flow: Flow;
    /** The level's key: a new level fits the view again */
    level: string;
    selected: (box: FlowBox) => boolean;
    flash: string | null;
    editable: boolean;
    onpick: (box: FlowBox) => void;
    onenter: (box: FlowBox) => void;
    /** Would a wire from this port to that one be applied (the candidate inlets light up only then) */
    canconnect: (from: [string, string], to: [string, string]) => boolean;
    onconnect: (from: [string, string], to: [string, string]) => void;
    /** Delete pressed on selected boxes and wires (the view's edge ids) */
    ondelete: (boxes: FlowBox[], edges: string[]) => void;
    /** The selection on the canvas changed: its box ids */
    onselect: (boxes: string[]) => void;
    /** A right click (or a long press): where, and on what */
    onmenu: (at: { x: number; y: number }, target: CanvasTarget) => void;
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

  /** What is selected on the canvas, kept across a new flow (a hover or an op draws the boxes again) */
  let chosen = $state<{ nodes: Set<string>; edges: Set<string> }>({ nodes: new Set(), edges: new Set() });
  $effect.pre(() => {
    void level;
    chosen = { nodes: new Set(), edges: new Set() };
  });

  let nodes = $state.raw<Node<LogicBoxData>[]>([]);
  let edges = $state.raw<Edge[]>([]);
  // Before the DOM: a new level's canvas mounts with its own boxes, so it fits them
  $effect.pre(() => {
    const neverBox = new Set(flow.wires.filter(w => w.never).flatMap(w => [w.source, w.target].filter(id => id.startsWith("stub:"))));
    nodes = flow.boxes.map(box => ({
      id: box.id, type: "logic", position: { x: box.x, y: box.y }, draggable: false, connectable: editable && !box.stub, selectable: editable && !box.stub,
      selected: chosen.nodes.has(box.id),
      data: { box, selected: selected(box), flash: flash === box.id, dim: !!lit && !lit.has(box.id), never: neverBox.has(box.id), editable, onpick, onenter },
    }));
    edges = flow.wires.map(w => ({
      id: w.id, source: w.source, target: w.target, sourceHandle: w.sourcePort, targetHandle: w.targetPort, label: w.never ? `${w.label} · never fires` : w.label,
      selectable: editable, focusable: editable, selected: chosen.edges.has(w.id), data: { edge: w.edge }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      class: ["logic-wire", `sig-${w.signal}`, w.never && "never", w.back && "back", lit && (lit.has(w.source) && lit.has(w.target) && (w.source === hovered || w.target === hovered) ? "lit" : "dim")],
    }));
  });

  /** A handle's id back to the port it stands for (`out:do` → `do`) */
  const portOf = (handle: string | null | undefined) => (handle ?? "").replace(/^(in|out):/, "");
  const ends = (c: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }): [[string, string], [string, string]] =>
    [[c.source, portOf(c.sourceHandle)], [c.target, portOf(c.targetHandle)]];
  const wireOf = (id: string) => flow.wires.find(w => w.id === id);
  const point = (e: MouseEvent | TouchEvent) => ("clientX" in e ? { x: e.clientX, y: e.clientY } : { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 });
  const sameSet = (a: Set<string>, b: string[]) => a.size === b.length && b.every(id => a.has(id));
</script>

<div class="flow" class:editable role="presentation" data-drop="logic" onpointerleave={() => (hovered = null)}>
  {#key level}
    <SvelteFlow bind:nodes bind:edges {nodeTypes} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }} minZoom={0.1} maxZoom={2}
      nodesDraggable={false} nodesConnectable={editable} elementsSelectable={editable} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}
      deleteKey={editable ? "Delete" : null} selectionKey={null} multiSelectionKey={editable ? "Shift" : null}
      isValidConnection={c => editable && canconnect(...ends(c))}
      onbeforeconnect={c => { onconnect(...ends(c)); return false; }}
      onbeforedelete={async ({ nodes: gone, edges: cut }) => {
        ondelete(gone.map(n => (n.data as LogicBoxData).box), cut.map(e => wireOf(e.id)?.edge ?? e.id));
        return false;
      }}
      onselectionchange={({ nodes: ns, edges: es }) => {
        const n = ns.map(x => x.id);
        const e = es.map(x => x.id);
        if (sameSet(chosen.nodes, n) && sameSet(chosen.edges, e)) return;
        chosen = { nodes: new Set(n), edges: new Set(e) };
        onselect(n);
      }}
      onnodeclick={({ node }) => onpick((node.data as LogicBoxData).box)}
      onnodecontextmenu={({ node, event }) => { event.preventDefault(); onmenu(point(event), { kind: "box", box: (node.data as LogicBoxData).box }); }}
      onedgecontextmenu={({ edge, event }) => { event.preventDefault(); const w = wireOf(edge.id); if (w) onmenu(point(event), { kind: "wire", edge: w.edge, label: w.label }); }}
      onpanecontextmenu={({ event }) => { event.preventDefault(); onmenu(point(event), { kind: "pane" }); }}
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
    --xy-connectionline-stroke-default: var(--text); --xy-connectionline-stroke-width-default: 1.5;
    font-family: var(--font);
  }
  .flow :global(.svelte-flow__node) { cursor: pointer; }
  /* The signal by dash: event solid, value dashed, node dotted, scene / address dash-dot (DESIGN.md has no signal colours, L-T8) */
  .flow :global(.logic-wire.sig-value path.svelte-flow__edge-path) { stroke-dasharray: 6 3; }
  .flow :global(.logic-wire.sig-node path.svelte-flow__edge-path) { stroke-dasharray: 1.5 2.5; }
  .flow :global(.logic-wire.sig-scene path.svelte-flow__edge-path), .flow :global(.logic-wire.sig-address path.svelte-flow__edge-path) { stroke-dasharray: 8 3 2 3; }
  .flow :global(.logic-wire.never path.svelte-flow__edge-path) { stroke-dasharray: 1 4; stroke-width: 1; }
  .flow :global(.logic-wire.lit path.svelte-flow__edge-path) { stroke: var(--text); stroke-width: 2; }
  .flow :global(.logic-wire.selected path.svelte-flow__edge-path) { stroke: var(--text); stroke-width: 2.5; }
  .flow :global(.logic-wire.dim) { opacity: .25; }
  .flow :global(.svelte-flow__edge-label) { font-size: .625rem; padding: 0 .125rem; }
  .flow :global(.svelte-flow__arrowhead polyline) { stroke: var(--muted) !important; fill: var(--muted) !important; }
  /* While a wire is dragged: the inlets that would take it are drawn heavy, the others faded */
  .flow :global(.svelte-flow__handle.connectingto), .flow :global(.svelte-flow__handle.valid) { background: var(--text); transform-origin: center; }
  .flow.editable :global(.svelte-flow__edge) { cursor: pointer; }
</style>
