<script lang="ts">
  import { onMount, tick, untrack, type Component } from "svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { getPlugins } from "@engine/content/game-config";
  import type { PluginData } from "@engine/types";
  import Icon from "#lib/components/Icon.svelte";
  import Toggle from "#lib/components/Toggle.svelte";
  import { content } from "#lib/content.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { selection } from "#lib/selection.svelte.js";
  import { getPlugin } from "#lib/api.js";
  import { declaredUses } from "@engine/types";
  import { pluginCodeUses, type PluginUses } from "#lib/logic/plugin-code.js";
  import { project, type LogicContent } from "#lib/logic/project.js";
  import { flowOf, handleId, type FlowBox } from "#lib/logic/flow.js";
  import { DECK_SIGNALS } from "#lib/logic/signals.js";
  import type { LogicCanvas } from "@engine/types";
  import {
    decodeContext, encodeContext, followSelection, levelName, parentLevel, pickSelected, sameContext, sceneOfContext, searchIndex, searchLogic,
    stageMove, type SearchHit, type StageMove,
  } from "#lib/logic/navigation.js";
  import type { Context, LogicPick, Op, RulePlace, RuleRef } from "#lib/logic/types.js";
  import { apply, refOf, takesWire, type OpResult } from "#lib/logic/apply.js";
  import { logicEdit } from "#lib/logic-edit.svelte.js";
  import { addChoices, wireChoices, type AddChoice, type AddContext, type WireFrom } from "#lib/logic/palette.js";
  import { logicDrag } from "#lib/logic-drag.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import type { CanvasTarget } from "./LogicCanvas.svelte";
  import LogicMenu, { type LogicMenuItem } from "./LogicMenu.svelte";
  import SignalPin from "./SignalPin.svelte";

  /**
   * The **Logic** panel (#239, #334 L-T3 – research §6): the experience's logic as a graph, **one level at a time** – the
   * experience (groups, scenes, plugins, the variables and core events that cross scenes), a group, a scene, a target's
   * entity – read-only. `logic/project.ts` computes the level's view from the draft, `logic/flow.ts` places it, and
   * `LogicCanvas.svelte` (`@xyflow/svelte`, loaded on first use) draws it.
   *
   * - **The level lives in one place**: `context`, set only by `go()`, and mirrored to the URL as `?logic=` (replaceState: a
   *   reload or a shared link lands on the same level, no history entry per step).
   * - **Moving**: a double-click, Enter or a box's arrow enters its level; the breadcrumb (`View.levels`) and ↑ / Backspace /
   *   Alt+↑ go back up; a stub at the border goes to its far end; the search finds any box of the experience and of each
   *   scene, goes to its level and marks it.
   * - **The stage follows** (§6.3, `onmove`): entering a scene opens it like the Scenes panel, entering an entity selects its
   *   node, a group or the experience selects it. **And the reverse** while *Follow* is on: a selection elsewhere moves the
   *   view to the deepest level that shows it (`followSelection`). A click on a box picks it (`onpick`): a node, a plugin
   *   (the Code tab), a group, the open scene.
   * - **Editing** (L-T4) on the open scene's scene and entity levels: gestures become ops (`logic/apply.ts`) – a drag from a
   *   port to a port connects, Delete on a selected wire or rule disconnects or removes it, a right click (or **+**, or a
   *   node type dragged from the Library's *Nodes*) opens the menu of every type (`logic/palette.ts`, grouped by family – an
   *   action or a condition with no rule selected makes a new rule); a wire let go on the empty canvas opens the menu of what
   *   can be made there and wired to its port, and the new box is pinned where the wire (or the right click) was let go. An op's trees go
   *   to the stage as the Inspector's edits do (`stage.override`: live at once, saved by the autosave, a step in History);
   *   its words – or why it was refused – show for a moment under the bar. A scene's and the experience's rules (content
   *   schema 5.0, L-T5b) go to `logicEdit`, which saves them; the experience level edits the experience's own rules only,
   *   the group level is read-only.
   * - What a plugin hears, emits, reads and sets is what its specs declare (schema 5.1, `declaredUses`); only for a plugin
   *   that declares nothing it is read from its source (stored, else the compiled module).
   *   Problems across the experience are listed under the graph, in the error colour.
   * - **Ports from the specs** (L-T6): a node's box shows its wired ports; its **+** (or its right-click menu) shows one of
   *   the hidden ones, *Hide unused ports* (Ctrl+H for every box) hides them again – the level's canvas keeps the choice
   *   (`logicEdit.setCanvas`). While a wire is dragged the inlets that take it light up; one let go where it does not fit
   *   says why.
   * - **The deck's canvas** (L-T7, schema 5.2): a box dragged by its head stays where it is let go (on the 1rem grid), *Tidy*
   *   lays the level out again; the selected boxes group with **Group** or Ctrl+G (a frame in the group's colour – its head
   *   folds it to a pill, its swatch takes the next colour, its name renames in place); a box's chevron folds it to its head.
   *   Each is a canvas op saved with the level's rules, so History lists it and Undo takes it back. The boxes, pins and wires
   *   wear the deck's signal colours (`logic/signals.ts`, L-T8 – the legend shows them).
   */
  let { experienceId, sceneId, stage = null, onpick, onmove }: {
    experienceId: string;
    sceneId: string;
    /** The stage: its live trees are what the view shows, and an op's trees go to it – shown at once, saved by themselves */
    stage?: Stage | null;
    onpick: (pick: LogicPick) => void;
    onmove: (move: StageMove) => void;
  } = $props();

  /** What each plugin's code uses, by plugin id – read once per experience and Run / save */
  let code = $state<Record<string, PluginUses>>({});

  const declared = $derived.by((): PluginData[] => {
    void plugins.version;
    void content.scenes;
    return getPlugins();
  });

  const readSource = async (plugin: PluginData): Promise<string | null> => {
    try {
      return (await getPlugin(experienceId, plugin.id)).plugin.source;
    } catch {
      try {
        const response = await fetch(plugin.src);
        return response.ok ? await response.text() : null;
      } catch {
        return null;
      }
    }
  };

  $effect(() => {
    // A plugin whose specs declare its bus use needs no reading of its source (`project.ts` prefers the declaration)
    const list = declared.filter(p => !declaredUses(p.registered));
    void plugins.stored;
    let current = true;
    void Promise.all(list.map(async p => [p.id, await readSource(p)] as const)).then(read => {
      if (current) code = Object.fromEntries(read.flatMap(([id, source]) => (source === null ? [] : [[id, pluginCodeUses(source)]])));
    });
    return () => { current = false; };
  });

  /** The open scene's trees as the stage shows them (an edit not saved yet included), the other scenes as the draft has them */
  const scenesShown = $derived(content.scenes.map(scene => (scene.id !== sceneId || !stage ? scene : {
    ...scene, targets: scene.targets.map(target => ({ ...target, entity: stage.overrides.has(target.id) ? stage.treeOf(target.id) : target.entity })),
  })));
  /** With the scenes' and the experience's rules and the variables as edited (`logicEdit`, content schema 5.0) */
  const logic = $derived<LogicContent>(logicEdit.withLogic({ scenes: scenesShown, groups: content.groups, plugins: declared, code }));

  // ── The level: one place, one setter ──
  /** The level the URL names – a scene's level only on its own scene's route */
  const fromUrl = untrack(() => {
    const asked = decodeContext(page.url.searchParams.get("logic"));
    const scene = asked && sceneOfContext(asked);
    return asked && (scene === null || scene === sceneId) ? asked : null;
  });
  let context = $state<Context>(untrack(() => fromUrl ?? { level: "scene", scene: sceneId }));
  /** The search's pick: drawn marked until the level changes */
  let flash = $state<string | null>(null);
  /** The view moves with the selection elsewhere (§6.3, the reverse) */
  let follow = $state(true);

  /** The one way the level changes; `stage`: the workspace follows (a move made here – not one that follows the workspace) */
  const go = (next: Context, { stage = true, mark = null as string | null } = {}) => {
    flash = mark;
    if (sameContext(next, context)) return;
    context = next;
    if (stage) onmove(stageMove(next));
  };

  const view = $derived(project(logic, context));
  /** The level's canvas: its scene's (the scene and entity levels) or the experience's; the group level keeps none */
  const levelCanvas = $derived.by((): LogicCanvas | undefined => {
    const at = context;
    if (at.level === "experience") return logic.canvas;
    if (at.level === "group") return undefined;
    return logic.scenes.find(s => s.id === at.scene)?.canvas;
  });
  const flow = $derived(flowOf(view, levelCanvas));
  const levelKey = $derived(encodeContext(context));
  const up = $derived(parentLevel(view));

  // A level from the URL: the workspace shows it too (a node selected, a group, the experience)
  onMount(() => {
    if (fromUrl && fromUrl.level !== "scene") onmove(stageMove(fromUrl));
  });

  // The URL carries the level (`?logic=`, decision L8) – again after a route change, which drops the query
  $effect(() => {
    const value = levelKey;
    void page.url.pathname;
    untrack(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("logic") === value) return;
      url.searchParams.set("logic", value);
      // Before the router is up (the first render) it refuses: the next change writes it
      replaceState(url, page.state).catch(() => {});
    });
  });

  // The selection elsewhere (the stage, the tree, the Scenes panel, the search) moves the view while it follows
  $effect(() => {
    const state = selection.snapshot();
    const id = sceneId;
    if (!follow) return;
    untrack(() => {
      const next = followSelection(view, state, id);
      go(next, { stage: false, mark: sameContext(next, context) ? flash : null });
    });
  });

  // ── Boxes ──
  const selectedBox = (box: FlowBox): boolean => !!box.node && pickSelected(box.node.pick, selection.snapshot(), sceneId, view);
  const pickBox = (box: FlowBox) => {
    if (box.pill) return;
    if (box.stub) return enterBox(box);
    if (box.node?.pick) onpick(box.node.pick);
  };
  const enterBox = (box: FlowBox) => {
    if (box.pill) return foldBox(box, false);
    if (box.stub) {
      const near = box.stub.side === "in" ? box.stub.edge.to[0] : box.stub.edge.from[0];
      go(box.stub.far, { mark: near });
    } else if (box.node?.enter) go(box.node.enter);
  };
  const goUp = () => { if (up) go(up); };
  const keydown = (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select");
    if (typing) return;
    // Delete and Backspace here are the panel's: the workspace's own (remove the selected tree node) never sees them
    if (e.key === "Delete" || e.key === "Backspace") e.stopPropagation();
    if (e.key === "Delete") {
      e.preventDefault();
      if (!editable) return say(readOnlyHint ?? "Read-only here.", true);
      const boxes = flow.boxes.filter(b => picked.includes(b.id));
      if (boxes.length || pickedWires.length) removeBoxes(boxes, pickedWires);
      picked = [];
      pickedWires = [];
    } else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) {
      e.preventDefault();
      goUp();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
      // The deck's Ctrl+G: the selected boxes become a group
      e.preventDefault();
      groupPicked();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
      // Blender's Ctrl+H: every box shows only its wired ports again
      e.preventDefault();
      if (!editable) return say(readOnlyHint ?? "Read-only here.", true);
      run({ op: "canvas", edit: { edit: "hideUnused" } });
    }
  };

  // ── Search ──
  let query = $state("");
  let searchOpen = $state(false);
  const searching = $derived(query.trim().length > 0);
  const index = $derived.by(() => (searching ? searchIndex(logic) : []));
  const hits = $derived(searching ? searchLogic(index, query) : []);
  const choose = (hit: SearchHit) => {
    go(hit.context, { mark: hit.node });
    query = "";
    searchOpen = false;
  };
  const searchKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && hits.length) {
      e.preventDefault();
      choose(hits[0]);
    } else if (e.key === "Escape") {
      query = "";
      searchOpen = false;
    }
  };

  // ── Editing (L-T4): gestures become ops, the ops' trees go to the stage like the Inspector's edits ──
  /**
   * Ops change the open scene's trees and rules at its scene and entity levels while the stage is there, and the
   * experience's own rules at the experience level
   */
  const editable = $derived(!!stage && (context.level === "experience" || ((context.level === "scene" || context.level === "entity") && context.scene === sceneId)));
  const readOnlyHint = $derived(
    context.level === "group" ? "Read-only at this level – open a scene or a target to edit its rules."
      : context.level === "experience" ? (stage ? null : "The stage is not up yet – editing starts with it.")
        : context.scene !== sceneId ? "Another scene – open it to edit its rules." : !stage ? "The stage is not up yet – editing starts with it." : null,
  );
  /** What the last op did, or why it was refused – shown briefly under the bar */
  let status = $state<{ text: string; refused: boolean } | null>(null);
  let statusTimer = 0;
  const say = (text: string, refused = false) => {
    status = { text, refused };
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => (status = null), refused ? 7000 : 5000);
  };
  /** Apply an op: its trees go to the stage (live at once; the autosave writes them to the draft, History has the step) */
  const run = (op: Op) => {
    const result = apply(op, logic, context);
    if (!result.ok) return say(result.reason, true);
    push(result);
  };
  /** An op's result to the stage and the saves */
  const push = (result: Extract<OpResult, { ok: true }>) => {
    for (const change of result.changed) void stage?.override(change.target, change.entity);
    // A scene's and the experience's rules save themselves (`PUT …/scenes/{sid}`, `PUT …/logic`), a step in History each
    for (const change of result.logic) {
      if (change.doc === "scene") logicEdit.setScene(change.scene, change.rules);
      else logicEdit.setExperience(change.rules);
    }
    // The ports exposed on the boxes: the level's canvas, saved with its rules
    for (const change of result.canvas) logicEdit.setCanvas(change);
    say(result.words);
  };
  const canConnect = (from: [string, string], to: [string, string]) => editable && apply({ op: "connect", from, to }, logic, context).ok;
  /** The handles that take a wire dragged from a port (the canvas lights them): every port on the other side the op would take */
  const takesFrom = (from: [string, string], dir: "in" | "out"): Map<string, Set<string>> => {
    const takes = new Map<string, Set<string>>();
    if (!editable) return takes;
    // A plugin's bus ports never take a wire (its code's uses) – `takesWire` leaves them out
    const ports = takesWire(logic, context, from, dir);
    for (const box of flow.boxes) {
      const ids = ports.get(box.id);
      if (!ids || box.stub) continue;
      for (const port of box.ports) if (ids.has(port.id) && port.dir === (dir === "in" ? "out" : "in")) takes.set(box.id, (takes.get(box.id) ?? new Set()).add(handleId(port)));
    }
    return takes;
  };
  /** A wire let go where it does not fit: the op's refusal says why (B8) */
  const refused = (from: [string, string], to: [string, string]) => {
    // A plugin's ports come from its code (uses): not a mistake to explain in red – its code opens instead (#334)
    const plugin = [from[0], to[0]].map(id => view.nodes.find(n => n.id === id)).find(n => n?.kind === "plugin");
    if (plugin?.pick) {
      onpick(plugin.pick);
      return say(`${plugin.label}'s ports come from its code (uses) – opened it in the Code tab.`);
    }
    const result = apply({ op: "connect", from, to }, logic, context);
    if (!result.ok) say(result.reason, true);
  };
  /** The box's +: its hidden ports to show, and hiding the unused ones again */
  const exposeMenu = (box: FlowBox, at: { x: number; y: number }) => {
    if (!editable) return say(readOnlyHint ?? "Read-only here.", true);
    const items: LogicMenuItem[] = box.hidden.map(p => ({
      key: `show:${p.dir}:${p.id}`, label: p.kind === "action" ? `Show the ${p.label} action` : p.kind === "event" ? `Show the ${p.label} event` : `Show ${p.label}`, detail: [p.owner, p.detail].filter(Boolean).join(" · "),
      select: () => run({ op: "canvas", edit: { edit: "expose", box: box.id, ports: [p.id] } }),
    }));
    if (box.hidden.length > 1) items.push({ key: "show:all", label: "Show every port", select: () => run({ op: "canvas", edit: { edit: "expose", box: box.id, ports: box.hidden.map(p => p.id) } }) });
    items.push({ key: "hide", label: "Hide unused ports", detail: "this box", select: () => run({ op: "canvas", edit: { edit: "hideUnused", box: box.id } }) });
    items.push({ key: "hide:all", label: "Hide unused ports on every box", detail: "Ctrl+H", select: () => run({ op: "canvas", edit: { edit: "hideUnused" } }) });
    menu = { at, head: `${box.node?.label ?? ""} – ports`, add: null, items };
  };

  // ── The deck's canvas (L-T7): placing, folding, groups ──
  const canvasOp = (edit: Extract<Op, { op: "canvas" }>["edit"]) => {
    if (!editable) return say(readOnlyHint ?? "Read-only here.", true);
    run({ op: "canvas", edit });
  };
  /** A box's chevron folds it to its head; a folded group's pill opens the group */
  const foldBox = (box: FlowBox, folded: boolean) => {
    if (box.pill) return canvasOp({ edit: "foldGroup", group: box.pill.id, folded: false });
    if (box.node) canvasOp({ edit: "fold", box: box.id, folded });
  };
  /** The selected boxes (the level's own – not a stub or a pill) become a group */
  const groupPicked = () => {
    const boxes = picked.filter(id => view.nodes.some(n => n.id === id));
    if (!boxes.length) return say(editable ? "Select the boxes to group first (Shift adds to the selection)." : readOnlyHint ?? "Read-only here.", true);
    canvasOp({ edit: "group", boxes });
  };
  const pinnedHere = $derived(view.nodes.some(n => !!levelCanvas?.positions?.[n.id]));

  /** The boxes selected on the canvas; the rule among them is where an action or a condition goes */
  let picked = $state<string[]>([]);
  /** The wires selected on the canvas (the view's edge ids): Delete disconnects them */
  let pickedWires = $state<string[]>([]);
  $effect.pre(() => {
    void levelKey;
    picked = [];
    pickedWires = [];
  });
  /** The rule a rule box stands for (its home without the part) */
  const ruleRefOf = (box: string): RuleRef | null => {
    const home = view.nodes.find(n => n.id === box && n.kind === "rule")?.home;
    return home ? refOf(home) : null;
  };
  const selectedRule = $derived(picked.map(ruleRefOf).find(r => r !== null) ?? null);
  /**
   * Where a new rule goes: a node box picked here, else the workspace's selected node in this scene, else the entity
   * level's own node; at the scene level with no node selected the scene's own rules, at the experience level the experience's
   */
  const place = $derived.by((): RulePlace | null => {
    if (!editable) return null;
    if (context.level === "experience") return { doc: "experience" };
    const box = view.nodes.find(n => picked.includes(n.id) && n.pick?.kind === "node");
    if (box?.pick?.kind === "node") return { doc: "entity", target: box.pick.target, path: box.pick.path };
    const s = selection.snapshot();
    const inScene = s.target && !s.entry && content.scene(sceneId)?.targets.some(t => t.id === s.target);
    if (context.level === "entity") {
      return inScene && s.target === context.target && !s.onTarget && context.path.every((p, i) => s.node[i] === p)
        ? { doc: "entity", target: s.target!, path: s.node } : { doc: "entity", target: context.target, path: context.path };
    }
    return inScene && !s.onTarget ? { doc: "entity", target: s.target!, path: s.node } : { doc: "scene", scene: sceneId };
  });

  // ── The menu: right click, the + button, a node type dropped from the Library ──
  type Pin = { x: number; y: number };
  type MenuState = { at: Pin; head: string; add: { kind: string | null; from?: WireFrom | null; pin?: Pin | null } | null; items: LogicMenuItem[] };
  let menu = $state<MenuState | null>(null);
  let menuQuery = $state("");
  const addContext = $derived<AddContext>({
    content: logic, context, place, rule: selectedRule,
    liveVariables: (stage?.vars ?? []).map(v => v.name), liveEvents: (stage?.events ?? []).map(e => e.event),
  });
  /** A choice as a menu row; `pin`: the box it makes is pinned there (a right click or a wire let go on the empty canvas) */
  const rowOf = (c: AddChoice, pin: Pin | null | undefined): LogicMenuItem => ({
    key: c.key, label: c.label, detail: c.detail, disabled: c.disabled, group: c.group, signal: c.signal, type: c.type,
    select: () => c.op && run(pin && c.op.op !== "canvas" ? { ...c.op, pin } : c.op),
  });
  const menuItems = $derived.by((): LogicMenuItem[] => {
    const add = menu?.add;
    if (!add) return menu?.items ?? [];
    const choices = add.from ? wireChoices(addContext, add.from, { query: menuQuery }) : addChoices(addContext, { kind: add.kind, query: menuQuery });
    return choices.map(c => rowOf(c, add.pin));
  });
  /** The menu's head: the verb and the kind – where it goes is the breadcrumb's (Tilman, 2026-11-21) */
  const addHead = (kind: string | null) => `Add${kind ? ` ${kind}` : ""}`;
  const openAdd = (at: Pin, kind: string | null = null, pin: Pin | null = null) => {
    if (!editable) return say(readOnlyHint ?? "Read-only here.", true);
    menuQuery = "";
    // A type dropped with exactly one choice is added at once
    const only = kind ? addChoices(addContext, { kind }) : [];
    if (only.length === 1 && only[0].op) return run(only[0].op);
    menu = { at, head: addHead(kind), add: { kind, pin }, items: [] };
  };
  /** A wire let go on the empty canvas (#334): what can be made there and wired to its port, pinned where it was let go */
  const wireDrop = (from: [string, string], dir: "in" | "out", at: Pin, flowAt: Pin | null) => {
    if (!editable) return say(readOnlyHint ?? "Read-only here.", true);
    const node = view.nodes.find(n => n.id === from[0]);
    if (!node) return;
    const port = node.ports.find(p => p.id === from[1] && p.dir === dir);
    menuQuery = "";
    menu = { at, head: `Add – wired to ${node.label}${port?.label ? ` · ${port.label}` : ""}`, add: { kind: null, from: { node, port: from[1], dir }, pin: flowAt }, items: [] };
  };
  /** Delete on what is selected: one wire or one rule per op (the ids of the rest change with it) */
  /**
   * Delete on what is selected (one wire or rule, or everything a selection box took – #334): the wires first, then the
   * rules from the last one up (an earlier rule's index stays right), each op on the documents the one before left; what
   * is refused is skipped and said. A node, an event or a variable is not deleted here.
   */
  const removeBoxes = (boxes: FlowBox[], edges: string[]) => {
    const refs = boxes.flatMap(b => (b.node?.kind === "rule" ? [ruleRefOf(b.id)] : [])).filter((r): r is RuleRef => r !== null).sort((x, y) => y.rule - x.rule);
    const others = boxes.filter(b => b.node && b.node.kind !== "rule");
    const ops: Op[] = [...edges.map((edge): Op => ({ op: "disconnect", edge })), ...refs.map((ref): Op => ({ op: "removeRule", home: { ...ref, part: "on" } }))];
    if (!ops.length) {
      if (others.length) say(`${others[0].node!.label}: only rules and wires are deleted here – a node goes in the tree, an event or a variable with the rules that name it.`, true);
      return;
    }
    if (ops.length === 1) return run(ops[0]);
    let docs = logic;
    let merged: Extract<OpResult, { ok: true }> | null = null;
    const refused: string[] = [];
    for (const op of ops) {
      const result = apply(op, docs, context);
      if (!result.ok) { refused.push(result.reason); continue; }
      docs = result.content;
      const key = (c: { doc?: string; scene?: string; target?: string }) => c.target ?? c.scene ?? c.doc;
      merged = !merged ? result : {
        ...result,
        changed: [...merged.changed.filter(c => !result.changed.some(n => key(n) === key(c))), ...result.changed],
        logic: [...merged.logic.filter(c => !result.logic.some(n => key(n) === key(c))), ...result.logic],
        canvas: [...merged.canvas.filter(c => !result.canvas.some(n => key(n) === key(c))), ...result.canvas],
      };
    }
    if (!merged) return say(refused[0] ?? "Nothing deleted.", true);
    const done = ops.length - refused.length;
    push({ ...merged, words: `Deleted ${done} of the selection (${[edges.length && `${edges.length} wire${edges.length === 1 ? "" : "s"}`, refs.length && `${refs.length} rule${refs.length === 1 ? "" : "s"}`].filter(Boolean).join(", ")})${refused.length ? ` – ${refused.length} refused: ${refused[0]}` : ""}${others.length ? " – nodes, events and variables stay" : ""}.` });
  };
  const openMenu = (at: Pin, target: CanvasTarget, flowAt?: Pin) => {
    if (target.kind === "pane") return openAdd(at, null, flowAt ?? null);
    if (target.kind === "wire") {
      menu = { at, head: `Wire ${target.label}`, add: null, items: [
        { key: "disconnect", label: "Disconnect", detail: "Delete", disabled: editable ? null : readOnlyHint, select: () => run({ op: "disconnect", edge: target.edge }) },
      ] };
      return;
    }
    const box = target.box;
    const items: LogicMenuItem[] = [];
    if (box.node?.enter || box.stub) items.push({ key: "enter", label: box.stub ? "Go there" : "Open its level", detail: "Double-click", select: () => enterBox(box) });
    if (box.node?.pick) items.push({ key: "pick", label: "Select", detail: "In the tree and the Inspector", select: () => pickBox(box) });
    if (box.node?.kind === "rule") {
      items.push({ key: "add", label: "Add an action or a condition…", disabled: editable ? null : readOnlyHint, select: () => { picked = [box.id]; void tick().then(() => openAdd(at)); } });
      items.push({ key: "delete", label: "Delete the rule", detail: "Delete", disabled: editable ? null : readOnlyHint, select: () => removeBoxes([box], []) });
    } else if (box.node?.kind === "node" && box.node.pick?.kind === "node") {
      items.push({ key: "add", label: "Add a rule on this node…", disabled: editable ? null : readOnlyHint, select: () => { picked = [box.id]; void tick().then(() => openAdd(at)); } });
    }
    if (box.pill) {
      items.push({ key: "open", label: "Open the group", detail: "Double-click", disabled: editable ? null : readOnlyHint, select: () => foldBox(box, false) });
    } else if (box.node) {
      items.push({ key: "fold", label: box.folded ? "Open the box" : "Fold to its head", disabled: editable ? null : readOnlyHint, select: () => foldBox(box, !box.folded) });
      if (box.pinned) items.push({ key: "unpin", label: "Tidy the level", detail: "the layout places every box again", disabled: editable ? null : readOnlyHint, select: () => canvasOp({ edit: "tidy" }) });
      items.push({ key: "group", label: picked.includes(box.id) && picked.length > 1 ? `Group the ${picked.length} selected boxes` : "Group this box", detail: "Ctrl+G", disabled: editable ? null : readOnlyHint,
        select: () => canvasOp({ edit: "group", boxes: picked.includes(box.id) ? picked.filter(id => view.nodes.some(n => n.id === id)) : [box.id] }) });
    }
    if (box.hidden.length || box.ports.some(p => p.kind)) {
      items.push({ key: "ports", label: "Show a port…", detail: box.hidden.length ? `${box.hidden.length} hidden` : "none hidden", disabled: editable ? (box.hidden.length ? null : "Every port shows.") : readOnlyHint, select: () => exposeMenu(box, at) });
      items.push({ key: "hide", label: "Hide unused ports", detail: "Ctrl+H: every box", disabled: editable ? null : readOnlyHint, select: () => run({ op: "canvas", edit: { edit: "hideUnused", box: box.id } }) });
    }
    menu = { at, head: box.stub ? box.stub.label : box.pill ? box.pill.label : box.node?.label ?? "", add: null, items };
  };
  let addButton = $state<HTMLButtonElement>();
  const plusMenu = () => {
    const rect = addButton?.getBoundingClientRect();
    openAdd({ x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4 });
  };
  // A node type dragged from the Library lands here while the canvas is there
  $effect(() => {
    if (!Canvas) return;
    logicDrag.ondrop = (kind, at) => openAdd(at, kind);
    return () => { logicDrag.ondrop = null; };
  });

  // ── The canvas, loaded on first use (xyflow stays out of the editor's first load) ──
  let Canvas = $state<Component<any> | null>(null);
  let canvasError = $state<string | null>(null);
  onMount(() => {
    import("./LogicCanvas.svelte").then(m => (Canvas = m.default)).catch(e => (canvasError = String(e?.message ?? e)));
  });

  const never = $derived(flow.wires.some(w => w.never));
  /** The signals OSCT draws, and what each stands for here (DESIGN.md "Logic canvas: signals") */
  const LEGEND = DECK_SIGNALS;
  const SIGNAL_WORDS: Record<string, string> = {
    event: "An event, and a rule's verb inlet", control: "A value: a number, a text, a choice, a colour",
    audio: "A sound file", picture: "A picture, a video, a texture or a model", address: "A node a verb acts on (show, hide, play …), an address",
    vote: "A value true / false", scene: "A scene (goto)", far: "From outside this level",
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="logic" onkeydown={keydown}>
  <div class="bar">
    <button type="button" class="icon-button" disabled={!up} onclick={goUp} aria-label="Up one level" title="Up one level (Backspace)"
      data-help-name="Up one level" data-help="Goes to the level above: from a target's entity to its scene, from a scene to its group or the experience. Backspace or Alt+↑ too."><Icon name="up" /></button>
    <nav class="crumbs" aria-label="Logic levels">
      {#each view.levels as level, i (encodeContext(level))}
        {#if i > 0}<span class="sep" aria-hidden="true">›</span>{/if}
        {#if i < view.levels.length - 1}
          <button type="button" class="crumb" onclick={() => go(level)}>{levelName(logic, level)}</button>
        {:else}
          <span class="crumb current" aria-current="location">{levelName(logic, level)}</span>
        {/if}
      {/each}
    </nav>
    <div class="search">
      <Icon name="search" />
      <input class="field" type="search" placeholder="Search the logic" aria-label="Search the experience's logic" bind:value={query}
        onfocus={() => (searchOpen = true)} onblur={() => setTimeout(() => (searchOpen = false), 150)} onkeydown={searchKey}
        data-help-name="Search the logic" data-help="Every box of the experience and of each scene – events, rules, variables, nodes, plugins, scenes. A hit opens its level and marks the box." />
      {#if searchOpen && searching}
        <ul class="hits" role="listbox" aria-label="Logic search">
          {#each hits as hit (`${encodeContext(hit.context)}|${hit.node}`)}
            <li role="option" aria-selected="false"><button type="button" onmousedown={e => e.preventDefault()} onclick={() => choose(hit)}>
              <span class="hit-label">{hit.label}</span><span class="hit-where">{hit.kind} · {hit.where}</span>
            </button></li>
          {:else}
            <li class="muted small none">Nothing found.</li>
          {/each}
        </ul>
      {/if}
    </div>
    <button bind:this={addButton} type="button" class="icon-button" disabled={!editable} onclick={plusMenu} aria-label="Add to the logic" title={editable ? "Add a rule, an action or a condition (or right-click the canvas)" : readOnlyHint ?? ""}
      data-help-name="Add to the logic" data-help="Every type, by family: an event (a new rule hears it), a condition or an action – for the selected rule, or with no rule selected a new rule on found (a node) or sceneChanged (the scene, the experience) that carries it. Type to filter; emit name, set name, when name or rule on name add a new one. A right click on the canvas, or a node dragged from the Library's Nodes, opens the same list; a wire let go on the empty canvas lists what can be made there and wired to it.">+</button>
    <button type="button" class="pill" disabled={!editable || !picked.some(id => view.nodes.some(n => n.id === id))} onclick={groupPicked}
      title={editable ? "Group the selected boxes (Ctrl+G)" : readOnlyHint ?? ""}
      data-help-name="Group" data-help="The selected boxes (Shift adds to the selection) get a frame of their own, as in the SCUTOONS deck: its head folds it to a pill, its swatch takes the next colour, a click on its name renames it – an empty name removes the group. A box sits in one group at most.">Group</button>
    <button type="button" class="pill" disabled={!editable || !pinnedHere} onclick={() => canvasOp({ edit: "tidy" })}
      title={editable ? (pinnedHere ? "Lay the level out again: every box you placed goes back into the layout" : "Nothing placed by hand at this level") : readOnlyHint ?? ""}
      data-help-name="Tidy" data-help="A box dragged by its head stays where you let it go (on the 1rem grid). Tidy drops those places at this level: the automatic layout places every box again.">Tidy</button>
    <span class="follow">
      <Toggle on={follow} label="Follow" onchange={on => (follow = on)}
        help="On: selecting a scene, a group or a node elsewhere (the stage, the tree, the Scenes panel) moves the Logic view to its level. Off: the view stays where you put it." />
      <span class="small">Follow</span>
    </span>
  </div>
  <div class="legend small" aria-label="Legend: the signals">
    {#each LEGEND as signal (signal)}
      <span class="sig" title={SIGNAL_WORDS[signal]}><SignalPin {signal} />{signal}</span>
    {/each}
    {#if never}
      <span class="wire never" data-help-name="Never fires"
        data-help="An event between two scenes: the engine builds the rules of the open scene only, so an event a rule emits in one scene never reaches another scene's rules. Plugins hear every scene."><svg viewBox="0 0 24 6" aria-hidden="true"><line x1="0" y1="3" x2="24" y2="3" /></svg>never fires</span>
    {/if}
  </div>
  {#if status}
    <p class="status small" class:danger={status.refused} role="status" aria-live="polite">{status.text}</p>
  {:else if readOnlyHint}
    <p class="status small muted">{readOnlyHint}</p>
  {/if}
  {#if content.loading && !content.scenes.length}
    <p class="muted small">Loading the draft…</p>
  {:else if !view.nodes.length && !view.stubs.length}
    <p class="muted small">No logic at this level: no rules and no plugin. Add a rule with + (or a behaviour to a node in the Inspector).</p>
  {:else if canvasError}
    <p class="danger small">The graph could not load: {canvasError}</p>
  {:else if Canvas}
    <Canvas {flow} level={levelKey} selected={selectedBox} {flash} {editable} onpick={pickBox} onenter={enterBox} canconnect={canConnect}
      onconnect={(from: [string, string], to: [string, string]) => run({ op: "connect", from, to })}
      onselect={(ids: string[], wires: string[]) => { picked = ids; pickedWires = wires; }} onmenu={openMenu}
      takesfrom={takesFrom} onrefused={refused} onwiredrop={wireDrop} onexpose={exposeMenu}
      onplace={(positions: Record<string, { x: number; y: number }>) => canvasOp({ edit: "place", positions })} onfold={foldBox}
      ongroupfold={(group: string, folded: boolean) => canvasOp({ edit: "foldGroup", group, folded })} ongroupcolour={(group: string) => canvasOp({ edit: "groupColour", group })}
      ongrouprename={(group: string, label: string) => canvasOp({ edit: "renameGroup", group, label })} />
  {:else}
    <p class="muted small">Loading the graph…</p>
  {/if}
  {#if view.problems.length}
    <ul class="problems" aria-label="Problems">
      {#each view.problems as p, i (i)}<li class="danger small">{p.message}</li>{/each}
    </ul>
  {/if}
  {#if menu}
    <LogicMenu at={menu.at} head={menu.head} items={menuItems} filter={!!menu.add} bind:query={menuQuery} onclose={() => (menu = null)} />
  {/if}
</div>

<style>
  .logic { display: flex; flex-direction: column; gap: .375rem; min-height: 0; flex: 1; padding: .375rem .5rem .5rem; }
  .bar { display: flex; align-items: center; gap: .375rem; flex-wrap: wrap; }
  .crumbs { display: flex; align-items: center; gap: .125rem; min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; }
  .crumb { border: 0; background: none; padding: 0 .25rem; height: var(--control-height); color: var(--muted); font: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; max-width: 12rem; }
  @media (hover: hover) {
    .crumb:hover { color: var(--text); background: var(--hover-background); }
    .hits button:hover { background: var(--hover-background); }
  }
  .crumb.current { color: var(--text); font-weight: 600; display: inline-flex; align-items: center; cursor: default; }
  .sep { color: var(--muted); }
  .search { position: relative; display: flex; align-items: center; gap: .25rem; color: var(--muted); }
  .search .field { width: 11rem; }
  .hits {
    position: absolute; z-index: 5; top: 100%; right: 0; width: 18rem; max-height: 16rem; overflow-y: auto; margin: .125rem 0 0; padding: .125rem 0;
    list-style: none; background: var(--surface); border: 1px solid var(--line);
  }
  .hits button {
    display: flex; flex-direction: column; align-items: flex-start; width: 100%; border: 0; background: none; padding: .25rem .5rem; font: inherit; color: var(--text); text-align: left; cursor: pointer;
  }
  .hits button:focus-visible { background: var(--hover-background); }
  .hit-label { font-weight: 600; }
  .hit-where { font-size: var(--text-small); color: var(--muted); }
  .none { padding: .25rem .5rem; }
  .follow { display: inline-flex; align-items: center; gap: .25rem; }
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; color: var(--muted); }
  .sig { display: inline-flex; align-items: center; gap: .1875rem; margin-right: .25rem; }
  .wire { display: inline-flex; align-items: center; gap: .1875rem; margin-left: .25rem; }
  .wire svg { width: 1.5rem; height: .375rem; }
  .wire line { stroke: var(--muted); stroke-width: 1.5; }
  .wire.never line { stroke-dasharray: 1 4; stroke-width: 1; }
  .status { margin: 0; overflow-wrap: anywhere; }
  .problems { margin: 0; padding: 0 0 0 1rem; display: flex; flex-direction: column; gap: .125rem; max-height: 6rem; overflow-y: auto; }
</style>
