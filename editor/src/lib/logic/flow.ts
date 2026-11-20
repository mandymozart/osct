import { LOGIC_SIZE, layoutLogic, type LayoutSize } from "./layout";
import { neverFires, stubNeverFires } from "./navigation";
import type { GraphNode, PortSpec, Signal, Stub, View } from "./types";

/**
 * A level's `View` as boxes and wires to draw (#334 L-T3): the rendering layer (`panels/LogicCanvas.svelte`, `@xyflow/svelte` –
 * decision L7) gets positions and ports from here and owns nothing. The boxes come from `layout.ts`; a level's **stubs** sit
 * at its border – what comes in in a column before the first, what goes out in a column after the last – each a box of its
 * own named by its far end. Every box has its ports (handles): the ports its node type gives (`registry.ts`) plus any
 * port an edge names that the type does not (so no wire is dropped), the inlets on the left, the outlets on the right.
 * A wire carries its signal (drawn by dash, not colour – DESIGN.md has no signal colours yet, L-T8) and whether it can
 * fire (`navigation.ts`: an event between two scenes never does).
 */

export interface FlowPort {
  id: string;
  label: string;
  signal: Signal;
  dir: "in" | "out";
}

export interface FlowBox {
  id: string;
  x: number;
  y: number;
  /** The node it draws; null for a stub */
  node: GraphNode | null;
  /** The stub it draws */
  stub: Stub | null;
  ports: FlowPort[];
}

export interface FlowWire {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  label: string;
  signal: Signal;
  /** It never fires (an event between two scenes, `navigation.ts`) */
  never: boolean;
  /** It runs against the flow (a loop) */
  back: boolean;
}

export interface Flow {
  boxes: FlowBox[];
  wires: FlowWire[];
}

const portsOf = (spec: readonly PortSpec[], used: readonly FlowPort[]): FlowPort[] => {
  const ports: FlowPort[] = spec.map(({ id, label, signal, dir }) => ({ id, label, signal, dir }));
  for (const u of used) if (!ports.some(p => p.id === u.id && p.dir === u.dir)) ports.push(u);
  return ports;
};

/** A handle's id: the port's id with its side, so an inlet and an outlet of one name stay apart */
export const handleId = (port: Pick<FlowPort, "id" | "dir">): string => `${port.dir}:${port.id}`;

export const flowOf = (view: View, size: LayoutSize = LOGIC_SIZE): Flow => {
  // The boxes without a wire (a scene without crossing logic, a plugin nobody's events touch) are no flow: `layout.ts` would
  // stack them all in its first column, so they sit in rows under the graph instead, in their order
  const wired = new Set([...view.edges.flatMap(e => [e.from[0], e.to[0]]), ...view.stubs.map(s => (s.side === "in" ? s.edge.to[0] : s.edge.from[0]))]);
  const loose = view.nodes.filter(n => !wired.has(n.id)).map(n => n.id);
  const graph = view.nodes.filter(n => wired.has(n.id)).map(n => n.id);
  const flowLayout = layoutLogic(graph, view.edges.map(e => ({ from: e.from[0], to: e.to[0], label: e.label })), size);
  const perRow = Math.max(1, Math.ceil(Math.sqrt(loose.length * 2)), Math.round((flowLayout.width + size.gapX / 2) / (size.w + size.gapX / 2)));
  const below = graph.length ? flowLayout.height + 3 * size.gapY : 0;
  const looseRows = Math.ceil(loose.length / perRow);
  const layout = {
    ...flowLayout,
    nodes: {
      ...flowLayout.nodes,
      ...Object.fromEntries(loose.map((id, i) => [id, { x: (i % perRow) * (size.w + size.gapX / 2), y: below + Math.floor(i / perRow) * (size.h + size.gapY), column: -1 }])),
    },
    width: Math.max(flowLayout.width, Math.min(loose.length, perRow) * (size.w + size.gapX / 2) - size.gapX / 2),
    height: graph.length ? flowLayout.height : looseRows * (size.h + size.gapY) - size.gapY,
  };
  const used = new Map<string, FlowPort[]>();
  const use = (node: string, port: FlowPort) => {
    const list = used.get(node) ?? [];
    if (!list.some(p => p.id === port.id && p.dir === port.dir)) list.push(port);
    used.set(node, list);
  };

  const backs = new Map(layout.edges.map(e => [`${e.from}>${e.to}`, e.back]));
  const wires: FlowWire[] = view.edges.map(e => {
    use(e.from[0], { id: e.from[1], label: e.from[1], signal: e.signal, dir: "out" });
    use(e.to[0], { id: e.to[1], label: e.to[1], signal: e.signal, dir: "in" });
    return {
      id: e.id, source: e.from[0], sourcePort: handleId({ id: e.from[1], dir: "out" }), target: e.to[0], targetPort: handleId({ id: e.to[1], dir: "in" }),
      label: e.label, signal: e.signal, never: neverFires(e), back: backs.get(`${e.from[0]}>${e.to[0]}`) ?? false,
    };
  });

  // The stubs at the border: one box each, in a column before (in) or after (out) the level's boxes
  const { w, h, gapX, gapY } = size;
  const column = (stubs: Stub[]) => {
    const tall = stubs.length * h + Math.max(0, stubs.length - 1) * gapY;
    const top = (layout.height - tall) / 2;
    return stubs.map((stub, i) => ({ stub, y: top + i * (h + gapY) }));
  };
  const indexed = view.stubs.map((stub, i) => ({ stub, id: `stub:${i}` }));
  const idOf = new Map(indexed.map(s => [s.stub, s.id]));
  const placed = [
    ...column(view.stubs.filter(s => s.side === "in")).map(({ stub, y }) => ({ stub, x: -(w + gapX), y })),
    ...column(view.stubs.filter(s => s.side === "out")).map(({ stub, y }) => ({ stub, x: (layout.width || w) + gapX, y })),
  ];
  const stubBoxes: FlowBox[] = placed.map(({ stub, x, y }) => {
    const id = idOf.get(stub)!;
    const near = stub.side === "in" ? stub.edge.to : stub.edge.from;
    const port: FlowPort = { id: stub.side === "in" ? "out" : "in", label: stub.edge.label, signal: stub.edge.signal, dir: stub.side === "in" ? "out" : "in" };
    use(near[0], { id: near[1], label: near[1], signal: stub.edge.signal, dir: stub.side === "in" ? "in" : "out" });
    const never = stubNeverFires(stub, view);
    wires.push(stub.side === "in"
      ? { id: `${id}>`, source: id, sourcePort: handleId(port), target: near[0], targetPort: handleId({ id: near[1], dir: "in" }), label: stub.edge.label, signal: stub.edge.signal, never, back: false }
      : { id: `>${id}`, source: near[0], sourcePort: handleId({ id: near[1], dir: "out" }), target: id, targetPort: handleId(port), label: stub.edge.label, signal: stub.edge.signal, never, back: false });
    return { id, x, y, node: null, stub, ports: [port] };
  });

  const boxes: FlowBox[] = view.nodes.map(node => {
    const at = layout.nodes[node.id];
    return { id: node.id, x: at.x, y: at.y, node, stub: null, ports: portsOf(node.ports, used.get(node.id) ?? []) };
  });
  return { boxes: [...boxes, ...stubBoxes], wires };
};
