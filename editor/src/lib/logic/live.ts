import type { Flow } from "./flow";
import type { LogicContent } from "./project";
import type { GraphEdge, GraphNode, Home, View } from "./types";

/**
 * **Live feedback** on the Logic canvas (#334, Tilman 2026-11-21: "when a event fire that cable should light up. or when a
 * variable changes. we can see what is actively happening then"): the stage's event lines (`stage.events` – the Log tab's)
 * matched to the wires and boxes of the level drawn. Pure: the panel builds the index once per flow (`liveIndex`) and asks
 * it per new line (`liveHit`); the canvas draws the hit for a moment.
 *
 * - **An event** (any line: a core event, a plugin's, a rule's emit): every wire that carries it by name – into and out of
 *   its event box (emitters to the box, the box to the rules' `on` and the plugins' `hears`), a plugin's declared event pin
 *   to the box, a bundled wire between two scenes or a stub that names it – and the event box itself.
 * - **`varChanged`** (its payload names the variable): the wires into and out of that variable – the rules' sets, its reads
 *   in conditions, a bundled wire or a stub that names it – and its box, with the new value (`values`).
 * - **`behaviour`** (a rule ran – its home, its event, what it did): the rule's box pulses and its wires light – the one
 *   into its `on` (a node's own event, `tap`, `found`, has no bus line of its own) and every one out of its actions. At the
 *   group and experience levels a scene's rule pulses its scene's box.
 *
 * A node's own event box (`event:<target>/<path>:tap`) is no bus event: only its rule's `behaviour` line lights it.
 */

/** A stage line as the panel has it (`StageEvent`): the name, its payload as one line, the frame's clock */
export interface LiveLine {
  event: string;
  detail: string;
  t?: number;
}

/** What one line lights: the drawn wires (their ids on the canvas), the boxes, and the values a variable box shows */
export interface LiveHit {
  wires: string[];
  boxes: string[];
  /** Box id → the variable's new value in words (`true`, `3`, `"open"`) */
  values: Record<string, string>;
}

/** The index of a flow: built once per flow, so a line costs a few map lookups */
export interface LiveIndex {
  /** Event name → wire ids; → event box ids */
  eventWires: Map<string, string[]>;
  eventBoxes: Map<string, string[]>;
  /** Variable name → wire ids; → variable box ids */
  varWires: Map<string, string[]>;
  varBoxes: Map<string, string[]>;
  /** A rule's key (`ruleKey`) → its box, the wires into its `on` and out of its actions */
  rules: Map<string, { box: string; wires: string[] }[]>;
  /** A scene's id → its box (the group and experience levels: a scene's rule pulses its scene) */
  scenes: Map<string, string>;
}

/** What `liveIndex` needs beyond the flow: a node's name in a target's tree (a node's rule line names its node by it) */
export interface LiveNames {
  nodeName?: (target: string, path: readonly number[]) => string | undefined;
}

/** The key of a rule as a `behaviour` line names it: a node's (its target, its node's name, its index), a scene's, the experience's */
export const ruleKey = (ref: { doc: "entity"; target: string; node: string; rule: number } | { doc: "scene"; scene: string; rule: number } | { doc: "experience"; rule: number }): string =>
  ref.doc === "entity" ? `entity|${ref.target}|${ref.node}|${ref.rule}` : ref.doc === "scene" ? `scene|${ref.scene}|${ref.rule}` : `experience|${ref.rule}`;

/**
 * A node's name in a target's tree, from the draft (the engine names a node's rule by it): the target looked up in `scene`
 * first, then in every scene
 */
export const nodeNames = (content: Pick<LogicContent, "scenes">, scene?: string): LiveNames => ({
  nodeName: (target, path) => {
    const scenes = [...content.scenes.filter(s => s.id === scene), ...content.scenes.filter(s => s.id !== scene)];
    let node = scenes.flatMap(s => s.targets).find(t => t.id === target)?.entity;
    for (const i of path) node = node?.children?.[i];
    return node?.name;
  },
});

const push = (map: Map<string, string[]>, key: string, value: string) => {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
};

/** A node's own event (`event:<target>/<path>:<on>`) – a hook of its node, no event of the bus */
const ownEvent = (node: GraphNode) => node.kind === "event" && node.id.includes("/");

/** The names an edge carries, and of what: its `names` (a derived edge's), else the event or variable box at one of its ends */
const carried = (edge: GraphEdge, nodes: ReadonlyMap<string, GraphNode>): { kind: "event" | "variable"; names: readonly string[] } | null => {
  if (edge.signal !== "event" && edge.signal !== "value") return null;
  const kind = edge.signal === "event" ? "event" : "variable";
  if (edge.names?.length) return { kind, names: edge.names };
  for (const end of [edge.from[0], edge.to[0]]) {
    const node = nodes.get(end);
    if (kind === "event" && node?.kind === "event" && !ownEvent(node)) return { kind, names: [node.label] };
    if (kind === "variable" && node?.kind === "variable") return { kind, names: [node.label] };
  }
  return null;
};

const ruleKeyOf = (home: Home, names: LiveNames): string | null => {
  if (home.doc === "scene") return ruleKey({ doc: "scene", scene: home.scene, rule: home.rule });
  if (home.doc === "experience") return ruleKey({ doc: "experience", rule: home.rule });
  const node = names.nodeName?.(home.target, home.path);
  return ruleKey({ doc: "entity", target: home.target, node: node?.trim() ?? "", rule: home.rule });
};

/** The index of a level's view as drawn: once per flow (a new level, an op, a fold) – never per line or per frame */
export const liveIndex = (view: View, flow: Flow, names: LiveNames = {}): LiveIndex => {
  const nodes = new Map(view.nodes.map(n => [n.id, n]));
  // A view's edge → the wires that draw it (a stub's wire names its edge; a folded group's wires keep theirs)
  const drawn = new Map<string, string[]>();
  for (const wire of flow.wires) push(drawn, wire.edge, wire.id);
  const shown = new Set(flow.boxes.map(b => b.id));
  const index: LiveIndex = { eventWires: new Map(), eventBoxes: new Map(), varWires: new Map(), varBoxes: new Map(), rules: new Map(), scenes: new Map() };
  for (const edge of [...view.edges, ...view.stubs.map(s => s.edge)]) {
    const wires = drawn.get(edge.id);
    const what = wires && carried(edge, nodes);
    if (!wires || !what) continue;
    for (const name of what.names) for (const wire of wires) push(what.kind === "event" ? index.eventWires : index.varWires, name, wire);
  }
  for (const node of view.nodes) {
    if (!shown.has(node.id)) continue; // folded into a group's pill
    if (node.kind === "event" && !ownEvent(node)) push(index.eventBoxes, node.label, node.id);
    else if (node.kind === "variable") push(index.varBoxes, node.label, node.id);
    else if (node.kind === "scene" && node.pick?.kind === "scene") index.scenes.set(node.pick.scene, node.id);
    else if (node.kind === "rule" && node.home) {
      const key = ruleKeyOf(node.home, names);
      if (!key) continue;
      const wires = view.edges.filter(e => (e.from[0] === node.id && e.from[1] !== "on") || (e.to[0] === node.id && e.to[1] === "on"))
        .concat(view.stubs.filter(s => s.edge.from[0] === node.id).map(s => s.edge))
        .flatMap(e => drawn.get(e.id) ?? []);
      const list = index.rules.get(key) ?? [];
      list.push({ box: node.id, wires: [...new Set(wires)] });
      index.rules.set(key, list);
    }
  }
  return index;
};

/**
 * A line's payload (`describePayload`: `name: "hasKey" · scope: "scene" · value: true`) back as fields – each value is
 * JSON, so a text holding ` · ` is joined again until it parses; a payload that is no fields gives none
 */
export const parseDetail = (detail: string): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  const parts = detail.split(" · ");
  for (let i = 0; i < parts.length; i++) {
    const m = /^([A-Za-z_$][\w$]*): ([\s\S]*)$/.exec(parts[i]);
    if (!m) continue;
    let raw = m[2];
    let j = i;
    for (;;) {
      if (raw === "–") { fields[m[1]] = undefined; break; }
      try {
        fields[m[1]] = JSON.parse(raw);
        i = j;
        break;
      } catch {
        if (++j >= parts.length) { fields[m[1]] = m[2]; break; }
        raw += ` · ${parts[j]}`;
      }
    }
  }
  return fields;
};

/** A value as a variable box shows it for a moment: short, a text quoted, nothing as – */
export const valueWords = (value: unknown, max = 14): string => {
  const words = value === undefined || value === null ? "–" : typeof value === "string" ? JSON.stringify(value) : String(value);
  return words.length > max ? `${words.slice(0, max - 1)}…` : words;
};

const NONE: readonly string[] = [];

/** What a stage line lights on the level (`liveIndex`): its event's wires and box, a variable's, a rule's */
export const liveHit = (index: LiveIndex, line: LiveLine): LiveHit => {
  const wires = new Set(index.eventWires.get(line.event) ?? NONE);
  const boxes = new Set(index.eventBoxes.get(line.event) ?? NONE);
  const values: Record<string, string> = {};
  if (line.event === "varChanged") {
    const fields = parseDetail(line.detail);
    if (typeof fields.name === "string") {
      (index.varWires.get(fields.name) ?? NONE).forEach(w => wires.add(w));
      for (const box of index.varBoxes.get(fields.name) ?? NONE) {
        boxes.add(box);
        values[box] = valueWords(fields.value);
      }
    }
  } else if (line.event === "behaviour") {
    const f = parseDetail(line.detail);
    const rule = typeof f.rule === "number" ? f.rule : null;
    let key: string | null = null;
    if (rule !== null && typeof f.targetId === "string") key = ruleKey({ doc: "entity", target: f.targetId, node: typeof f.node === "string" ? f.node.trim() : "", rule });
    else if (rule !== null && f.home === "scene" && typeof f.scene === "string") key = ruleKey({ doc: "scene", scene: f.scene, rule });
    else if (rule !== null && f.home === "experience") key = ruleKey({ doc: "experience", rule });
    for (const hit of (key && index.rules.get(key)) || []) {
      boxes.add(hit.box);
      hit.wires.forEach(w => wires.add(w));
    }
    const scene = f.home === "scene" && typeof f.scene === "string" ? index.scenes.get(f.scene) : undefined;
    if (scene) boxes.add(scene);
  }
  return { wires: [...wires], boxes: [...boxes], values };
};

/**
 * The lines new since the last seen (`seen`: the frame's clock of the newest line seen), oldest first, and the new mark.
 * The stage keeps its lines newest first. Opening the panel marks the newest as seen (`markSeen`), so the history is never
 * replayed; an emptied timeline (Clear, a new frame) starts again from nothing; a clock that went back (the frame reloaded
 * without emptying) only moves the mark.
 */
export const freshLines = <T extends LiveLine>(lines: readonly T[], seen: number): { fresh: T[]; seen: number } => {
  if (!lines.length) return { fresh: [], seen: -Infinity };
  const newest = lines[0].t ?? -Infinity;
  if (newest < seen) return { fresh: [], seen: newest };
  const fresh: T[] = [];
  for (const line of lines) {
    if ((line.t ?? -Infinity) <= seen) break;
    fresh.push(line);
  }
  return { fresh: fresh.reverse(), seen: Math.max(seen, newest) };
};

/** The mark for a timeline as it stands: everything in it counts as seen */
export const markSeen = (lines: readonly LiveLine[]): number => (lines.length ? lines[0].t ?? -Infinity : -Infinity);

/** How long a lit wire or a pulsing box stays lit (ms) – the canvas's animation runs as long */
export const LIVE_MS = 1000;

/**
 * The live state the canvas draws: per wire and box the pulse's number (a new firing a new number, so its animation starts
 * again) and when it ends; per variable box the value it shows
 */
export interface LiveState {
  wires: Map<string, { n: number; until: number }>;
  boxes: Map<string, { n: number; until: number; value?: string }>;
}

export const emptyLive = (): LiveState => ({ wires: new Map(), boxes: new Map() });

/** The state with a hit added at `now` (pulse number `n`), and the ended pulses dropped */
export const addHit = (state: LiveState, hit: LiveHit, now: number, n: number, ms = LIVE_MS): LiveState => {
  const next = prune(state, now);
  for (const w of hit.wires) next.wires.set(w, { n, until: now + ms });
  for (const b of hit.boxes) next.boxes.set(b, { n, until: now + ms, ...(hit.values[b] !== undefined ? { value: hit.values[b] } : {}) });
  return next;
};

/** The state without the pulses that ended by `now` (a new state) */
export const prune = (state: LiveState, now: number): LiveState => ({
  wires: new Map([...state.wires].filter(([, p]) => p.until > now)),
  boxes: new Map([...state.boxes].filter(([, p]) => p.until > now)),
});
