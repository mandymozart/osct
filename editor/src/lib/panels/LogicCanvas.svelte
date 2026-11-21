<script lang="ts" module>
  /** A gesture's target on the canvas: a box, a wire (by the view's edge id) or the empty canvas */
  export type CanvasTarget =
    | { kind: "box"; box: import("#lib/logic/flow.js").FlowBox }
    | { kind: "wire"; edge: string; label: string }
    | { kind: "pane" }
    /** A group's frame head (#334) */
    | { kind: "group"; group: string }
    /** A note (schema 5.3) */
    | { kind: "note"; note: import("#lib/logic/flow.js").FlowNote };
</script>

<script lang="ts">
  import { SelectionMode, SvelteFlow, type Edge, type Node } from "@xyflow/svelte";
  import LogicViewControls from "./LogicViewControls.svelte";
  import "@xyflow/svelte/dist/base.css";
  import { NOTE_NODE, frameOf, type Flow, type FlowBox, type FlowNote } from "#lib/logic/flow.js";
  import { GRID } from "#lib/logic/signals.js";
  import LogicBox, { type LogicBoxData } from "./LogicBox.svelte";
  import LogicFrame, { type LogicFrameData } from "./LogicFrame.svelte";
  import LogicNote, { type LogicNoteData } from "./LogicNote.svelte";
  import LogicRef from "./LogicRef.svelte";
  import LogicWire from "./LogicWire.svelte";

  /**
   * The Logic panel's canvas (#334 L-T3, L-T4, L-T7): `@xyflow/svelte` as the **rendering layer only** (decision L7) – the
   * boxes, their ports, the wires and the groups' frames come from `logic/flow.ts`, which has them from the level's `View`,
   * `logic/layout.ts` and the level's canvas; xyflow pans, zooms and fits, and **reports gestures, owning nothing**: a drag
   * from a port to a port (`onconnect`), a box or a frame dragged by its head (`onplace`: where its boxes were let go, on the
   * 1rem grid), Delete on a selected wire or box (the panel reads `onselect` and handles the key), a right click (`onmenu`),
   * a fold, a group's colour or name. The panel turns them into ops (`logic/apply.ts`); xyflow never adds, removes or keeps
   * a node or an edge itself – its own connect and delete are refused, the documents come back as a new flow. While
   * `editable` is off (the group level, another scene) nothing connects, moves, is selected or deleted. The panel imports
   * this component lazily, so the editor's first load does not carry xyflow.
   *
   * The look is the SCUTOONS deck's (RULES #38's exception for the Logic canvas): cards (`LogicBox`), hanging wires in their
   * signal's colour (`LogicWire`, `logic/signals.ts`), dotted group frames (`LogicFrame`) under the boxes. A drag starts on a
   * box's head only, so dragging from a pin still connects. While a box is dragged, its group's frame follows; a frame's head
   * drags every box of the group.
   *
   * While a wire is dragged (L-T6, B8), every handle that would take it is drawn heavy and the rest fade (`takesfrom`, asked
   * once when the drag starts); a wire let go over a handle that refuses it is reported (`onrefused`), so the panel can say
   * why. A wire let go on the empty canvas – over no handle – reports `onwiredrop` with where (the screen point and the flow's,
   * #334), so the panel offers what can be made there and wired to the port. A box's + reports `onexpose`.
   *
   * **Selecting** (the deck's way, #334): a drag on the empty canvas draws a selection box – every box and wire it touches is
   * selected, Shift adds to what was – so Group (Ctrl+G) and Delete act on them; panning is the middle button, Space + drag,
   * and the wheel or the trackpad. Stubs and folded groups' pills are never selected.
   *
   * **References** (#334): a plugin's display rows (what its code reads, sets, drives) join their boxes by fine dotted lines
   * (`LogicRef`) – no wire: they take no pointer, are never selected or deleted and light nothing on hover.
   *
   * **Groups** (#334): a click on a frame's head (not its chevron, swatch or name – and not a drag) selects the group's boxes,
   * Shift adds them; a right click on the head reports `onmenu` with the group. The panel selects a group's boxes from its
   * menu through `selectBoxes`.
   *
   * **Notes** (schema 5.3, `LogicNote`): cards of the level's notes, no logic – they are selected (a click, the selection
   * box; `onselect` names them `note:<id>`) and dragged like boxes (their place goes out through `onplace` as `note:<id>`:
   * a free note's place, a note beside a box its offset from it), and follow their box while it is dragged; a dotted line
   * joins a note to its box (`LogicRef`). Its text is edited in place (`onnoteedit`).
   */
  let {
    flow, level, selected, flash, editable, onpick, onenter, canconnect, onconnect, onselect, onmenu, takesfrom, onrefused, onwiredrop, onexpose, onplace, onfold,
    ongroupfold, ongroupcolour, ongrouprename, onnoteedit,
  }: {
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
    /** The selection on the canvas changed: its box ids and its wires (the view's edge ids) – Delete is the panel's */
    onselect: (boxes: string[], edges: string[]) => void;
    /** A right click (or a long press): where, on what, and where on the flow (the empty canvas: a new box is pinned there) */
    onmenu: (at: { x: number; y: number }, target: CanvasTarget, flowAt?: { x: number; y: number }) => void;
    /** The handles that take a wire dragged from this port, by box id (handle ids, `in:act:play`) */
    takesfrom: (from: [string, string], dir: "in" | "out") => Map<string, Set<string>>;
    /** A wire let go over a handle that does not take it: the panel says why */
    onrefused: (from: [string, string], to: [string, string]) => void;
    /** A wire let go over no handle: its port, which way it was dragged, the screen point and the flow's */
    onwiredrop?: (from: [string, string], dir: "in" | "out", at: { x: number; y: number }, flowAt: { x: number; y: number } | null) => void;
    /** A box's +: show one of its hidden ports */
    onexpose: (box: FlowBox, at: { x: number; y: number }) => void;
    /** Boxes dragged and let go: where they are now (box id → its place) */
    onplace: (positions: Record<string, { x: number; y: number }>) => void;
    /** A box's chevron: fold it to its head or open it (a folded group's pill: open the group) */
    onfold: (box: FlowBox, folded: boolean) => void;
    ongroupfold: (group: string, folded: boolean) => void;
    ongroupcolour: (group: string) => void;
    ongrouprename: (group: string, label: string) => void;
    /** A note's new text (empty removes it) */
    onnoteedit: (note: string, text: string) => void;
  } = $props();

  /** Select these boxes, as a click would (`add`: to what is selected) – the group menu's Select boxes */
  export function selectBoxes(ids: string[], add = false) {
    if (!editable) return;
    choose(add ? [...new Set([...chosen.nodes, ...ids])] : ids, add ? [...chosen.edges] : []);
  }
  /** A screen point on the flow (null before the flow is up) – N adds a note at the pointer */
  export function flowPoint(at: { x: number; y: number }): { x: number; y: number } | null {
    return toFlow?.(at) ?? null;
  }

  /** While a wire is dragged: the handles that take it, by box */
  let dragging = $state.raw<Map<string, Set<string>> | null>(null);
  /** Where a wire's drag started (a click on a pin that does not move opens nothing) */
  let wireStart: { x: number; y: number } | null = null;
  /** While a selection box is drawn: what it selects so far, and the selection before it (Shift adds to that) */
  let boxing: { before: { nodes: string[]; edges: string[] }; nodes: string[]; edges: string[] } | null = null;
  /** From the screen to the flow's coordinates – handed up by the controls inside the flow */
  let toFlow: ((point: { x: number; y: number }) => { x: number; y: number }) | null = null;
  const NONE: ReadonlySet<string> = new Set();

  let hovered = $state<string | null>(null);
  // Another level: nothing is lit (the box under the pointer went away without a leave)
  $effect.pre(() => {
    void level;
    hovered = null;
  });
  const nodeTypes = { logic: LogicBox, frame: LogicFrame, note: LogicNote };
  const edgeTypes = { logic: LogicWire, ref: LogicRef };

  // A box hovered on the level before (it went away under the pointer) lights nothing here
  // A box with no wire lights nothing and dims nothing; the hovered box itself is never dimmed
  const lit = $derived.by(() => {
    if (dragging || !hovered || !flow.boxes.some(b => b.id === hovered)) return null;
    const touching = flow.wires.filter(w => w.source === hovered || w.target === hovered);
    return touching.length ? new Set([hovered, ...touching.flatMap(w => [w.source, w.target])]) : null;
  });

  /** What is selected on the canvas, kept across a new flow (a hover or an op draws the boxes again) */
  let chosen = $state<{ nodes: Set<string>; edges: Set<string> }>({ nodes: new Set(), edges: new Set() });
  $effect.pre(() => {
    void level;
    chosen = { nodes: new Set(), edges: new Set() };
  });

  /** A frame's node id */
  const FRAME = "frame:";
  /** Bumped when a drag ends without a new flow (nothing moved, or refused): the boxes go back to the flow's places */
  let redraw = $state(0);
  /** While boxes are dragged: hovering lights nothing (a new drawing would drop the drag) */
  let moving = false;

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  // Before the DOM: a new level's canvas mounts with its own boxes, so it fits them
  $effect.pre(() => {
    void redraw;
    const neverBox = new Set(flow.wires.filter(w => w.never).flatMap(w => [w.source, w.target].filter(id => id.startsWith("stub:"))));
    const frames: Node<LogicFrameData>[] = flow.groups.filter(g => !g.folded).map(group => ({
      id: `${FRAME}${group.id}`, type: "frame", position: { x: group.x, y: group.y }, zIndex: -1, draggable: editable, dragHandle: ".frame-head",
      selectable: false, connectable: false, focusable: false,
      data: {
        group, w: group.w, h: group.h, editable, onfold: ongroupfold, oncolour: ongroupcolour, onrename: ongrouprename,
        onselect: (id: string, add: boolean) => selectBoxes(flow.groups.find(g => g.id === id)?.members ?? [], add),
        onmenu: (id: string, at: { x: number; y: number }) => onmenu(at, { kind: "group", group: id }),
      },
    }));
    const notes: Node<LogicNoteData>[] = flow.notes.map(note => ({
      id: `${NOTE_NODE}${note.id}`, type: "note", position: { x: note.x, y: note.y }, draggable: editable, selectable: editable, connectable: false,
      selected: chosen.nodes.has(`${NOTE_NODE}${note.id}`),
      data: { note, selected: chosen.nodes.has(`${NOTE_NODE}${note.id}`), editable, onedit: onnoteedit },
    }));
    const boxes: Node<LogicBoxData>[] = flow.boxes.map(box => ({
      id: box.id, type: "logic", position: { x: box.x, y: box.y }, draggable: editable && !box.stub, dragHandle: ".drag-head",
      connectable: editable && !box.stub && !box.pill, selectable: editable && !box.stub && !box.pill,
      selected: chosen.nodes.has(box.id),
      data: {
        box, selected: selected(box), flash: flash === box.id, dim: !!lit && !lit.has(box.id), hover: hovered === box.id, never: neverBox.has(box.id), editable,
        takes: dragging ? dragging.get(box.id) ?? NONE : null, onpick, onenter, onexpose, onfold,
      },
    }));
    nodes = [...frames, ...boxes, ...notes];
    edges = flow.wires.map((w): Edge => ({
      id: w.id, type: "logic", source: w.source, target: w.target, sourceHandle: w.sourcePort, targetHandle: w.targetPort, label: w.never ? `${w.label} · never fires` : w.label,
      selectable: editable, focusable: editable, selected: chosen.edges.has(w.id), data: { edge: w.edge, deck: w.deck, never: w.never },
      class: ["logic-wire", `sig-${w.deck}`, w.never && "never", w.back && "back", lit && (lit.has(w.source) && lit.has(w.target) && (w.source === hovered || w.target === hovered) ? "lit" : "dim")].filter(Boolean).join(" "),
    })).concat(flow.refs.map((r): Edge => ({
      // A display row's reference (#334): drawn under the wires, never selected, deleted or lit – not a wire
      id: r.id, type: "ref", source: r.source, target: r.target, sourceHandle: r.sourceHandle, targetHandle: r.targetHandle,
      selectable: false, focusable: false, deletable: false, zIndex: -1, class: "logic-ref",
    }))).concat(flow.notes.flatMap((n): Edge[] => (n.link ? [{
      // A note beside its box (schema 5.3): a dotted line like a reference – not a wire
      id: `note-link:${n.id}`, type: "ref", source: `${NOTE_NODE}${n.id}`, target: n.link.target, sourceHandle: n.link.sourceHandle, targetHandle: n.link.targetHandle,
      selectable: false, focusable: false, deletable: false, zIndex: -1, class: "logic-ref",
    }] : [])));
  });
  const noteOf = (node: Node): FlowNote | null => (node.type === "note" ? (node.data as LogicNoteData).note : null);

  // ── Placing: a box or a frame dragged by its head ──
  /** Where the boxes were when the drag started */
  let starts = new Map<string, { x: number; y: number }>();
  /** The boxes a dragged node moves: a box itself, a frame or a folded group's pill its group's boxes */
  const moved = (node: Node): string[] => {
    if (node.id.startsWith(FRAME)) return flow.groups.find(g => `${FRAME}${g.id}` === node.id)?.members ?? [];
    const box = flow.boxes.find(b => b.id === node.id);
    return box?.pill ? box.pill.members : box && !box.stub ? [box.id] : [];
  };
  const placeOf = (node: Node) => {
    const start = starts.get(`node|${node.id}`);
    return start ? { dx: node.position.x - start.x, dy: node.position.y - start.y } : { dx: 0, dy: 0 };
  };
  /** What a drag moves: the selection when the dragged box is in it, else the dragged box (or frame) alone */
  let carried = new Set<string>();
  const dragStart = (dragged: Node[], target: Node | null) => {
    moving = true;
    hovered = null;
    starts = new Map([...flow.boxes.map(b => [b.id, { x: b.x, y: b.y }] as const), ...nodes.map(n => [`node|${n.id}`, { ...n.position }] as const)]);
    carried = new Set(target && !chosen.nodes.has(target.id) ? [target.id] : dragged.map(n => n.id));
  };
  /** The boxes' places while dragging: each carried node's boxes by its move */
  const placesNow = (dragged: Node[]): Map<string, { x: number; y: number }> => {
    const places = new Map<string, { x: number; y: number }>();
    for (const node of dragged.filter(n => carried.has(n.id))) {
      const { dx, dy } = placeOf(node);
      for (const id of moved(node)) {
        const start = starts.get(id);
        if (start) places.set(id, { x: start.x + dx, y: start.y + dy });
      }
    }
    return places;
  };
  /** Where a box is now while dragging: moved by its frame, or carried itself (a box, a pill) – undefined: it stays */
  const boxNow = (id: string, places: Map<string, { x: number; y: number }>, dragged: Node[]) =>
    places.get(id) ?? (carried.has(id) ? dragged.find(n => n.id === id)?.position : undefined);
  /** While dragging: a frame's or a pill's boxes follow it, a frame follows its boxes, a note its box; a selected box not carried stays */
  const drag = (dragged: Node[]) => {
    const places = placesNow(dragged);
    const sizeOf = new Map(flow.boxes.map(b => [b.id, b]));
    const at = (id: string) => places.get(id) ?? starts.get(id) ?? { x: 0, y: 0 };
    nodes = nodes.map(node => {
      if (carried.has(node.id)) return node;
      const note = noteOf(node);
      if (note) {
        const box = note.link && note.offset ? boxNow(note.link.target, places, dragged) : undefined;
        return box ? { ...node, position: { x: box.x + note.offset!.x, y: box.y + note.offset!.y } } : node;
      }
      if (node.type === "frame") {
        const group = (node.data as LogicFrameData).group;
        if (!group.members.some(id => places.has(id))) return node;
        const frame = frameOf(group.members.map(id => ({ ...at(id), w: sizeOf.get(id)?.w ?? 0, h: sizeOf.get(id)?.h ?? 0 })));
        return { ...node, position: { x: frame.x, y: frame.y }, data: { ...node.data, w: frame.w, h: frame.h } };
      }
      const place = places.get(node.id) ?? starts.get(`node|${node.id}`);
      return place && (place.x !== node.position.x || place.y !== node.position.y) ? { ...node, position: place } : node;
    });
  };
  const dragStop = (dragged: Node[]) => {
    moving = false;
    const places = placesNow(dragged);
    const positions: Record<string, { x: number; y: number }> = {};
    for (const [id, place] of places) {
      const start = starts.get(id);
      if (start && (start.x !== place.x || start.y !== place.y)) positions[id] = place;
    }
    // A carried note: a free one's place, one beside a box its offset from where the box is now
    for (const node of dragged.filter(n => carried.has(n.id))) {
      const note = noteOf(node);
      if (!note) continue;
      const box = note.link ? boxNow(note.link.target, places, dragged) ?? starts.get(`node|${note.link.target}`) : undefined;
      const place = box ? { x: node.position.x - box.x, y: node.position.y - box.y } : { ...node.position };
      const was = note.offset ?? { x: note.x, y: note.y };
      if (place.x !== was.x || place.y !== was.y) positions[node.id] = place;
    }
    starts = new Map();
    carried = new Set();
    if (Object.keys(positions).length) onplace(positions);
    redraw++;
  };

  /** A handle's id back to the port it stands for (`out:do` → `do`) */
  const portOf = (handle: string | null | undefined) => (handle ?? "").replace(/^(in|out):/, "");
  const ends = (c: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }): [[string, string], [string, string]] =>
    [[c.source, portOf(c.sourceHandle)], [c.target, portOf(c.targetHandle)]];
  const wireOf = (id: string) => flow.wires.find(w => w.id === id);
  const boxOf = (node: Node) => (node.type === "logic" ? (node.data as LogicBoxData).box : null);
  /** The handle under the pointer where a drag ended (a touch: where the finger left) */
  const handleAt = (e: MouseEvent | TouchEvent): { nodeId: string; id: string | null } | null => {
    const at = "clientX" in e ? { x: e.clientX, y: e.clientY } : { x: e.changedTouches[0]?.clientX ?? 0, y: e.changedTouches[0]?.clientY ?? 0 };
    const handle = document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>(".svelte-flow__handle");
    return handle?.dataset.nodeid ? { nodeId: handle.dataset.nodeid, id: handle.dataset.handleid ?? null } : null;
  };
  const point = (e: MouseEvent | TouchEvent) => ("clientX" in e ? { x: e.clientX, y: e.clientY } : { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 });
  /** The canvas's selection is kept here, not by xyflow: a new flow (a hover, an op) draws the boxes again and keeps it */
  const choose = (nodeIds: string[], edgeIds: string[]) => {
    chosen = { nodes: new Set(nodeIds), edges: new Set(edgeIds) };
    onselect(nodeIds, edgeIds.map(id => wireOf(id)?.edge ?? id));
  };
</script>

<div class="flow" class:editable role="presentation" data-drop="logic" onpointerleave={() => (hovered = null)}>
  {#key level}
    <SvelteFlow bind:nodes bind:edges {nodeTypes} {edgeTypes} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }} minZoom={0.1} maxZoom={2}
      nodesDraggable={editable} snapGrid={[GRID, GRID]} selectNodesOnDrag={false}
      nodesConnectable={editable} elementsSelectable={editable} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}
      deleteKey={null} selectionKey={null} multiSelectionKey={editable ? "Shift" : null}
      selectionOnDrag={editable} selectionMode={SelectionMode.Partial} panOnDrag={editable ? [1] : true} panActivationKey="Space"
      onselectionstart={() => { boxing = { before: { nodes: [...chosen.nodes], edges: [...chosen.edges] }, nodes: [], edges: [] }; }}
      onselectionchange={({ nodes: inBox, edges: wiresInBox }) => {
        if (!boxing) return;
        boxing.nodes = inBox.filter(n => (n.type === "logic" || n.type === "note") && n.selectable !== false).map(n => n.id);
        boxing.edges = wiresInBox.filter(e => wireOf(e.id)).map(e => e.id);
      }}
      onselectionend={event => {
        const box = boxing;
        boxing = null;
        if (!box || !editable) return;
        choose(event.shiftKey ? [...new Set([...box.before.nodes, ...box.nodes])] : box.nodes, event.shiftKey ? [...new Set([...box.before.edges, ...box.edges])] : box.edges);
      }}
      isValidConnection={c => editable && canconnect(...ends(c))}
      onbeforeconnect={c => { onconnect(...ends(c)); return false; }}
      onconnectstart={(event, p) => {
        wireStart = point(event);
        if (editable && p.nodeId && p.handleId) dragging = takesfrom([p.nodeId, portOf(p.handleId)], p.handleType === "target" ? "in" : "out");
      }}
      onconnectend={(event, state) => {
        dragging = null;
        const start = wireStart;
        wireStart = null;
        const from = state.fromHandle;
        // xyflow names no handle it would not take: the one under the pointer is where the wire was let go
        const to = state.toHandle ?? handleAt(event);
        if (editable && state.isValid !== true && from?.nodeId && to?.nodeId && `${to.nodeId}|${to.id}` !== `${from.nodeId}|${from.id}`) {
          onrefused([from.nodeId, portOf(from.id)], [to.nodeId, portOf(to.id)]);
        } else if (editable && state.isValid !== true && from?.nodeId && from.id && !to && start) {
          // Let go over no handle (#334): the menu of what can be made there and wired to the port
          const at = "clientX" in event ? { x: event.clientX, y: event.clientY } : { x: event.changedTouches[0]?.clientX ?? 0, y: event.changedTouches[0]?.clientY ?? 0 };
          // After the pointer is up: xyflow ends its drag first, so the menu keeps the focus for typing
          const port: [string, string] = [from.nodeId, portOf(from.id)];
          const dir = from.type === "target" ? "in" : "out";
          if (Math.hypot(at.x - start.x, at.y - start.y) > 8) setTimeout(() => onwiredrop?.(port, dir, at, toFlow?.(at) ?? null));
        }
      }}
      onnodedragstart={({ nodes: dragged, targetNode }) => dragStart(dragged, targetNode)}
      onnodedrag={({ nodes: dragged }) => drag(dragged)}
      onnodedragstop={({ nodes: dragged }) => dragStop(dragged)}
      onbeforedelete={async () => false}
      onnodeclick={({ node, event }) => {
        if (noteOf(node)) {
          if (editable) choose(event.shiftKey ? [...chosen.nodes, node.id] : [node.id], event.shiftKey ? [...chosen.edges] : []);
          return;
        }
        const box = boxOf(node);
        if (!box) return;
        if (editable && !box.stub && !box.pill) choose(event.shiftKey ? [...chosen.nodes, node.id] : [node.id], event.shiftKey ? [...chosen.edges] : []);
        onpick(box);
      }}
      onedgeclick={({ edge, event }) => { if (editable && wireOf(edge.id)) choose(event.shiftKey ? [...chosen.nodes] : [], event.shiftKey ? [...chosen.edges, edge.id] : [edge.id]); }}
      onpaneclick={() => choose([], [])}
      onnodecontextmenu={({ node, event }) => {
        event.preventDefault();
        const box = boxOf(node);
        const note = noteOf(node);
        const at = point(event);
        onmenu(at, box ? { kind: "box", box } : note ? { kind: "note", note } : { kind: "pane" }, toFlow?.(at));
      }}
      onedgecontextmenu={({ edge, event }) => { event.preventDefault(); const w = wireOf(edge.id); if (w) onmenu(point(event), { kind: "wire", edge: w.edge, label: w.label }); }}
      onpanecontextmenu={({ event }) => { event.preventDefault(); const at = point(event); onmenu(at, { kind: "pane" }, toFlow?.(at)); }}
      onnodepointerenter={({ node }) => { if (!moving && node.type === "logic") hovered = node.id; }} onnodepointerleave={({ node }) => { if (hovered === node.id) hovered = null; }}>
      <LogicViewControls onflow={f => (toFlow = f)} />
    </SvelteFlow>
  {/key}
</div>

<style>
  /* The canvas runs to the panel's sides (and its foot, when nothing lies below) and fades out there instead of stopping in a gap;
     the fade lies on the zoom layer, not on the panel with the view controls, so they stay crisp */
  .flow { position: relative; flex: 1; min-height: 8rem; margin: 0 -.5rem; --edge-fade: 1.5rem; }
  .flow:last-child { margin-bottom: -.5rem; }
  .flow :global(.svelte-flow__zoom) {
    mask-image: linear-gradient(to right, transparent, #000 var(--edge-fade), #000 calc(100% - var(--edge-fade)), transparent),
      linear-gradient(to bottom, #000 calc(100% - var(--edge-fade)), transparent);
    mask-composite: intersect;
  }
  .flow :global(.svelte-flow) {
    --xy-background-color: transparent; --xy-edge-stroke: var(--muted); --xy-edge-stroke-width: 1.4; --xy-handle-background-color: var(--surface);
    --xy-edge-label-background-color: transparent; --xy-edge-label-color: var(--muted); --xy-controls-button-background-color: var(--surface);
    --xy-controls-button-background-color-hover: var(--hover-background); --xy-controls-button-color: var(--text); --xy-controls-button-border-color: var(--line);
    --xy-connectionline-stroke-default: var(--text); --xy-connectionline-stroke-width-default: 1.5;
    font-family: var(--font);
  }
  .flow :global(.svelte-flow__node) { cursor: pointer; }
  /* A frame lies under the boxes and the wires; only its head takes the pointer */
  .flow :global(.svelte-flow__node-frame) { cursor: default; pointer-events: none; }
  .flow :global(.logic-wire.lit path.svelte-flow__edge-path) { stroke-width: 2.5px !important; stroke-opacity: 1 !important; }
  .flow :global(.logic-wire.dim) { opacity: .45; }
  /* A wire's word: in its signal's colour, a little heavier, its letters outlined in white so it reads over crossing wires –
     no box behind it (Tilman, 2026-11-21: "the text should have a white outline not a semi transparent backdrop"), white
     in day and night alike */
  .flow :global(.svelte-flow__edge-label) {
    font-size: .625rem; font-weight: 500; padding: 0 .25rem; color: var(--wire-label, var(--text)); background: none;
    text-shadow: 1px 0 0 #fff, -1px 0 0 #fff, 0 1px 0 #fff, 0 -1px 0 #fff, 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 0 0 2px #fff;
  }
  .flow :global(.svelte-flow__edge.logic-ref) { pointer-events: none; }
  /* While a wire is dragged: the inlets that would take it are drawn heavy */
  .flow :global(.svelte-flow__handle.connectingto.valid) { outline: 2px solid var(--text); }
  .flow.editable :global(.svelte-flow__edge) { cursor: pointer; }
</style>
