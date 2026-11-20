import type { BehaviourCondition, BehaviourAction } from "@engine/types";

/**
 * The **logic model** shared by every level of the Logic view (#334, `agents/research/2026-11-20-logic-nodes-shared-concept.md`
 * §5.2): the documents are the logic, the graph is a view of them. A `View` is computed from the draft for one level
 * (`Context`) and never stored; each edge that a document holds names that document's place (`Home`), so an edit can later
 * become an op on that one document (L-T4). Edges that only join by name – the bus (`emit doorOpened` → `on doorOpened`), a
 * variable set in one scene and read in another, a plugin's code – have no home (`null`): drawing them changes nothing.
 * Pure types: no DOM, no store – the folder moves into a package with #255.
 */

/** What flows along an edge and through a port (a subset of SCUTOONS' deck-kit `Signal`, same names) */
export type Signal = "event" | "value" | "node" | "scene" | "address" | "far";

export interface PortSpec {
  /** Unique on its node: `on`, `when`, `do:0`, `out` … */
  id: string;
  label: string;
  signal: Signal;
  dir: "in" | "out";
  /** It takes or gives more than one edge */
  many?: boolean;
}

/** The families of node types; `free` is room for canvas nodes that no document projects (§5.7, none yet) */
export type NodeFamily = "event" | "rule" | "action" | "variable" | "entity" | "scene" | "plugin" | "far" | "free";

/** Who registered a node type: the core, a title (an app built on the core) or a plugin by its id */
export type NodeOwner = "core" | (string & {});

/** A node type of the registry (`registry.ts`): its family, its ports for the params of one node, its owner */
export interface NodeType<P = unknown> {
  kind: string;
  family: NodeFamily;
  ports(params: P): PortSpec[];
  owner: NodeOwner;
}

/** Where the Logic view stands: the whole experience, a group, a scene, or one target's entity tree (`path`: its subtree) */
export type Context =
  | { level: "experience" }
  | { level: "group"; group: string }
  | { level: "scene"; scene: string }
  | { level: "entity"; scene: string; target: string; path: number[] };

export type Level = Context["level"];

/** The part of a rule an edge stands for; `index`: the test of `when`, the action of `do` */
type RulePart = { part: "on" | "when" | "do"; index?: number };

/**
 * The document place an edge comes from. `entity`: a rule of a `behaviour` component of a target's node (`component` is
 * the node's component index, `rule` the rule's index in it). `scene` / `experience` are declared for the scene and
 * experience rules of the MAJOR (L-T5); nothing projects them yet.
 */
export type Home =
  | ({ doc: "entity"; target: string; path: number[]; component: number; rule: number } & RulePart)
  | ({ doc: "scene"; scene: string; rule: number } & RulePart)
  | ({ doc: "experience"; rule: number } & RulePart);

/** What a click on a box selects in the workspace */
export type LogicPick =
  | { kind: "node"; target: string; path: number[] }
  | { kind: "plugin"; plugin: string }
  | { kind: "scene"; scene: string }
  | { kind: "group"; group: string };

export interface GraphNode {
  id: string;
  /** Its node type's kind (`registry.ts`) */
  kind: string;
  /** The line it shows */
  label: string;
  /** The smaller second line: whose event, whose rule, the scopes a variable is set in, what a plugin is */
  detail: string;
  ports: PortSpec[];
  pick: LogicPick | null;
  /** The level a double-click opens (a group, a scene, an entity) */
  enter?: Context;
  /** What is wrong with it (drawn in the error colour), if anything */
  problem?: string;
  /** It stands for something outside this level */
  far?: boolean;
  /** The id of the group node it sits in (a frame) */
  group?: string;
}

export interface GraphEdge {
  id: string;
  from: [node: string, port: string];
  to: [node: string, port: string];
  signal: Signal;
  /** The word on the edge: `on`, `when`, `set = true`, `emit`, `show`, a plugin's type, `event · 2` … */
  label: string;
  /** The document place it comes from; null = derived (a by-name join: the bus, a variable across scenes, a plugin's use) */
  home: Home | null;
}

/** An edge leaving the level: drawn at its border, named by its far end; following it opens `far` */
export interface Stub {
  edge: GraphEdge;
  /** `in`: it comes from outside to a box here; `out`: from a box here to outside */
  side: "in" | "out";
  far: Context;
  label: string;
}

export interface Problem {
  message: string;
  /** The box it is about, when it is one of this view's */
  node?: string;
}

/** A free node on the canvas (§5.7) – declared only; the canvas comes with L-T7 */
export interface CanvasNode {
  id: string;
  kind: string;
  label: string;
  params: Record<string, unknown>;
}

/** The stored canvas beside a rules list (decision L4): groups, notes, folds, free nodes – empty until L-T7 */
export interface Canvas {
  nodes: CanvasNode[];
  wires: Array<{ from: [string, string]; to: [string, string] }>;
}

export interface View {
  context: Context;
  /** The levels from the experience down to this one, root first (the breadcrumb) */
  levels: Context[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  stubs: Stub[];
  problems: Problem[];
  canvas: Canvas;
}

/** Edits to the canvas (§5.7) – declared only (L-T7) */
export type CanvasEdit =
  | { edit: "addNode"; node: CanvasNode }
  | { edit: "moveNode"; id: string; x: number; y: number }
  | { edit: "setParams"; id: string; params: Record<string, unknown> }
  | { edit: "wire"; from: [string, string]; to: [string, string] }
  | { edit: "unwire"; from: [string, string]; to: [string, string] }
  | { edit: "run"; id: string };

/** An edit of the logic as an op on one document – declared only; `apply` comes with L-T4 */
export type Op =
  | { op: "addRule"; at: Home }
  | { op: "connect"; from: [string, string]; to: [string, string] }
  | { op: "disconnect"; edge: string }
  | { op: "setCondition"; home: Home; tests: BehaviourCondition["tests"] }
  | { op: "addAction"; home: Home; action: BehaviourAction }
  | { op: "removeAction"; home: Home }
  | { op: "removeRule"; home: Home }
  | { op: "canvas"; edit: CanvasEdit };
