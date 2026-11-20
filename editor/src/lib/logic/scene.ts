import { project, type LogicContent } from "./project";
import type { LogicPick } from "./types";

/**
 * The **logic of a scene** in the shape the Logic panel draws today (#239, `panels/LogicPanel.svelte`): the scene level of
 * `project()` (#334) with its edges as plain `from → to` with a word. The panel draws no ports, stubs or levels yet (L-T3);
 * edges that differ only by their document place (two rules showing the same node) are drawn once, as before.
 */

/** The kinds of box the panel draws at the scene level */
export type LogicKind = "event" | "rule" | "variable" | "node" | "plugin";

/** What a click on a box of the scene level selects: a node of a target's entity, or a plugin in the Code tab */
export type ScenePick = Extract<LogicPick, { kind: "node" | "plugin" }>;

export interface LogicNode {
  id: string;
  kind: LogicKind;
  label: string;
  detail: string;
  pick: ScenePick | null;
  problem?: string;
}

export interface LogicEdge {
  from: string;
  to: string;
  /** The word on the edge: `on`, `when`, `set = true`, `emit`, `show`, a plugin's type … */
  label: string;
}

export interface LogicGraph {
  nodes: LogicNode[];
  edges: LogicEdge[];
  /** Every problem in words, in the order found */
  problems: string[];
}

/** The logic graph of the scene `sceneId` of the experience's content */
export const sceneLogic = (content: LogicContent, sceneId: string): LogicGraph => {
  const view = project(content, { level: "scene", scene: sceneId });
  const edges: LogicEdge[] = [];
  for (const e of view.edges) {
    if (!edges.some(known => known.from === e.from[0] && known.to === e.to[0] && known.label === e.label)) edges.push({ from: e.from[0], to: e.to[0], label: e.label });
  }
  return {
    nodes: view.nodes.map(({ id, kind, label, detail, pick, problem }) => ({
      id, kind: kind as LogicKind, label, detail, pick: pick as ScenePick | null, ...(problem ? { problem } : {}),
    })),
    edges,
    problems: view.problems.map(p => p.message),
  };
};
