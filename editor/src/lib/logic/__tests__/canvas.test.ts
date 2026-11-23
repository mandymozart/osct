import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canvasProblems, type LogicCanvas } from "@engine/types";
import { apply, type OpResult } from "../apply";
import { BOX_HEAD, FRAME_HEAD, FRAME_PAD, NOTE_BESIDE, PORT_ROW, boxHeight, flowOf, noteView, pillId } from "../flow";
import { project, type LogicContent } from "../project";
import { CARD_W, DECK_SIGNALS, GRID, GROUP_COLOURS, SIGNAL_STYLES, deckSignal, hangPath } from "../signals";
import type { CanvasEdit, Context } from "../types";
import { content } from "./fixture";

const scene: Context = { level: "scene", scene: "door" };
const ok = (result: OpResult) => {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result;
};
const edit = (e: CanvasEdit, c: LogicContent = content, at: Context = scene) => apply({ op: "canvas", edit: e }, c, at);
/** The door scene's canvas after an op */
const canvasOf = (result: OpResult): LogicCanvas | undefined => ok(result).content.scenes.find(s => s.id === "door")!.canvas;
const view = project(content, scene);
const [a, b, c] = view.nodes.filter(n => n.kind === "rule").map(n => n.id);

describe("the signal grammar is one table (#334 L-T8)", () => {
  it("names the deck's signals with their shapes and weights", () => {
    expect([...DECK_SIGNALS]).toEqual(["event", "control", "audio", "picture", "address", "vote", "scene", "far"]);
    expect(Object.fromEntries(DECK_SIGNALS.map(s => [s, SIGNAL_STYLES[s].shape]))).toEqual({
      event: "triangle", control: "dot", audio: "square", picture: "square", address: "diamond", vote: "dot", scene: "square", far: "ring",
    });
    expect(SIGNAL_STYLES.event.weight).toBe(1.4);
  });

  it("keeps app.css's day and night tokens equal to the table", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");
    const blocks = [css.slice(0, css.indexOf("@media (pointer: coarse)")), css.slice(css.indexOf(':root:not([data-scheme="light"])')), css.slice(css.indexOf(':root[data-scheme="dark"]'))];
    const token = (block: string, name: string) => block.match(new RegExp(`--signal-${name}:\\s*(#[0-9a-f]{6});`))?.[1];
    for (const s of DECK_SIGNALS) {
      expect(token(blocks[0], s), s).toBe(SIGNAL_STYLES[s].day);
      expect(token(blocks[1], s), s).toBe(SIGNAL_STYLES[s].night);
      expect(token(blocks[2], s), s).toBe(SIGNAL_STYLES[s].night);
    }
  });

  it("maps OSCT's signals to the closest deck signal", () => {
    expect(deckSignal("event")).toBe("event");
    expect(deckSignal("node", undefined, "action")).toBe("event");
    expect(deckSignal("value", { kind: "number", min: 0, max: 1 })).toBe("control");
    expect(deckSignal("value", { kind: "integer", min: 0, max: 9 })).toBe("control");
    expect(deckSignal("value", { kind: "string" })).toBe("control");
    expect(deckSignal("value", { kind: "boolean" })).toBe("vote");
    expect(deckSignal("value")).toBe("control");
    expect(deckSignal("node")).toBe("address");
    expect(deckSignal("address")).toBe("address");
    expect(deckSignal("scene")).toBe("scene");
    expect(deckSignal("media", { kind: "file", accepts: "audio" })).toBe("audio");
    expect(deckSignal("media", { kind: "file", accepts: "video" })).toBe("picture");
    expect(deckSignal("media", { kind: "texture" })).toBe("picture");
    expect(deckSignal("far")).toBe("far");
  });

  it("hangs a wire under its ends as the deck does: 0.35rem plus a tenth of their distance", () => {
    const wire = hangPath({ x: 0, y: 100 }, { x: 300, y: 100 });
    expect(wire.x).toBeCloseTo(150);
    expect(wire.y - 100).toBeCloseTo(0.35 * GRID + 0.1 * 300);
    expect(wire.d.startsWith("M0,100 C")).toBe(true);
  });
});

describe("the deck's cards and the canvas in the flow (#334 L-T7)", () => {
  it("draws 14rem cards whose heights snap to the 1rem grid, a named port per row", () => {
    const flow = flowOf(view);
    for (const box of flow.boxes) {
      expect(box.w).toBe(CARD_W);
      expect(box.h % GRID).toBe(0);
      expect(Math.abs(box.x % GRID)).toBe(0);
      expect(Math.abs(box.y % GRID)).toBe(0);
    }
    const rule = flow.boxes.find(x => x.id === a)!;
    // on / when on the left, an action per row on the right
    expect(rule.h).toBeGreaterThanOrEqual(BOX_HEAD + 2 * PORT_ROW);
    expect(boxHeight(rule.ports, true)).toBe(BOX_HEAD);
    expect(flow.wires.every(w => DECK_SIGNALS.includes(w.deck))).toBe(true);
  });

  it("puts a pinned box where it was let go and a folded box at its head's height", () => {
    const flow = flowOf(view, { positions: { [a]: { x: 32, y: -48 } }, folds: [b] });
    const pinned = flow.boxes.find(x => x.id === a)!;
    expect([pinned.x, pinned.y, pinned.pinned]).toEqual([32, -48, true]);
    const folded = flow.boxes.find(x => x.id === b)!;
    expect([folded.folded, folded.h]).toEqual([true, BOX_HEAD]);
  });

  it("frames a group round its boxes and folds it to one pill that takes their wires", () => {
    const canvas: LogicCanvas = { positions: { [a]: { x: 0, y: 0 }, [b]: { x: 320, y: 64 } }, groups: [{ id: "group-1", label: "door rules", members: [a, b, "rule:elsewhere"], colour: "#7fd68a" }] };
    const open = flowOf(view, canvas);
    const group = open.groups[0];
    const hb = open.boxes.find(x => x.id === b)!.h;
    expect(group).toMatchObject({ id: "group-1", members: [a, b], colour: "#7fd68a", folded: false, x: -FRAME_PAD, y: -FRAME_HEAD, w: 320 + CARD_W + 2 * FRAME_PAD });
    expect(group.h).toBe(64 + hb + FRAME_HEAD + FRAME_PAD);
    expect(open.boxes.find(x => x.id === a)!.group).toBe("group-1");

    const folded = flowOf(view, { ...canvas, groups: [{ ...canvas.groups![0], folded: true }] });
    expect(folded.boxes.some(x => x.id === a || x.id === b)).toBe(false);
    const pill = folded.boxes.find(x => x.id === pillId("group-1"))!;
    expect(pill.pill?.label).toBe("door rules");
    const touching = open.wires.filter(w => [a, b].includes(w.source) !== [a, b].includes(w.target));
    expect(folded.wires.filter(w => w.source === pill.id || w.target === pill.id)).toHaveLength(touching.length);
    expect(folded.wires.some(w => [a, b].includes(w.source) || [a, b].includes(w.target))).toBe(false);
  });
});

describe("placing, folding and groups are canvas ops (#334 L-T7)", () => {
  it("place pins boxes on the grid, tidy drops the level's pins", () => {
    const placed = edit({ edit: "place", positions: { [a]: { x: 37, y: -9 } } });
    expect(canvasOf(placed)).toEqual({ positions: { [a]: { x: 32, y: -16 } } });
    expect(ok(placed).words).toMatch(/pinned where you let go/);
    expect(edit({ edit: "place", positions: { "rule:nowhere": { x: 0, y: 0 } } })).toMatchObject({ ok: false });
    const tidy = edit({ edit: "tidy" }, ok(placed).content);
    expect(canvasOf(tidy)).toBeUndefined();
    expect(edit({ edit: "tidy" })).toEqual({ ok: false, reason: "Nothing is pinned at this level – the layout places every box already." });
  });

  it("fold folds a box to its head and opens it again", () => {
    const folded = edit({ edit: "fold", box: a, folded: true });
    expect(canvasOf(folded)).toEqual({ folds: [a] });
    expect(canvasOf(edit({ edit: "fold", box: a, folded: false }, ok(folded).content))).toBeUndefined();
    expect(edit({ edit: "fold", box: a, folded: false })).toMatchObject({ ok: false });
  });

  it("group makes group-N with the first free colour; a box leaves its old group, an empty group goes", () => {
    const first = edit({ edit: "group", boxes: [a, b] });
    expect(canvasOf(first)!.groups).toEqual([{ id: "group-1", label: "group 1", members: [a, b], colour: GROUP_COLOURS[0] }]);
    const second = edit({ edit: "group", boxes: [b, c] }, ok(first).content);
    expect(canvasOf(second)!.groups).toEqual([
      { id: "group-1", label: "group 1", members: [a], colour: GROUP_COLOURS[0] },
      { id: "group-2", label: "group 2", members: [b, c], colour: GROUP_COLOURS[1] },
    ]);
    const third = edit({ edit: "group", boxes: [a] }, ok(second).content);
    // group-1 lost its last box and went: its id and colour are free again
    expect(canvasOf(third)!.groups).toEqual([
      { id: "group-2", label: "group 2", members: [b, c], colour: GROUP_COLOURS[1] },
      { id: "group-1", label: "group 1", members: [a], colour: GROUP_COLOURS[0] },
    ]);
    expect(edit({ edit: "group", boxes: [] })).toMatchObject({ ok: false });
    expect(edit({ edit: "group", boxes: ["stub:0"] })).toMatchObject({ ok: false });
  });

  it("renames in place (empty removes), cycles the colour and folds a group", () => {
    const grouped = ok(edit({ edit: "group", boxes: [a] })).content;
    const renamed = edit({ edit: "renameGroup", group: "group-1", label: " The door " }, grouped);
    expect(canvasOf(renamed)!.groups![0].label).toBe("The door");
    expect(canvasOf(edit({ edit: "renameGroup", group: "group-1", label: "  " }, grouped))).toBeUndefined();
    expect(canvasOf(edit({ edit: "groupColour", group: "group-1" }, grouped))!.groups![0].colour).toBe(GROUP_COLOURS[1]);
    const folded = edit({ edit: "foldGroup", group: "group-1", folded: true }, grouped);
    expect(canvasOf(folded)!.groups![0].folded).toBe(true);
    expect(canvasOf(edit({ edit: "foldGroup", group: "group-1", folded: false }, ok(folded).content))!.groups![0]).not.toHaveProperty("folded");
    expect(edit({ edit: "groupColour", group: "group-9" }, grouped)).toEqual({ ok: false, reason: "That group is not there any more." });
  });

  it("writes canvases the shared guard accepts, and edits the experience's canvas at the experience level", () => {
    const grouped = ok(edit({ edit: "group", boxes: [a, b] }));
    const placed = ok(edit({ edit: "place", positions: { [a]: { x: 16, y: 16 } } }, grouped.content));
    expect(canvasProblems(canvasOf({ ...placed }), "c")).toEqual([]);
    const experience = project(content, { level: "experience" });
    const at = experience.nodes[0].id;
    const result = ok(edit({ edit: "place", positions: { [at]: { x: 0, y: 0 } } }, content, { level: "experience" }));
    expect(result.canvas).toEqual([{ doc: "experience", canvas: { positions: { [at]: { x: 0, y: 0 } } } }]);
    expect(edit({ edit: "tidy" }, content, { level: "group", group: "ch1" })).toMatchObject({ ok: false });
  });
});

describe("selecting and ungrouping a group (#334, Tilman 2026-11-21)", () => {
  it("a frame names the level's boxes it holds – what a click on its head selects", () => {
    const grouped = ok(edit({ edit: "group", boxes: [a, b] })).content;
    const flow = flowOf(project(grouped, scene), canvasOf(edit({ edit: "group", boxes: [a, b] })));
    expect(flow.groups.map(g => [g.id, g.members])).toEqual([["group-1", [a, b]]]);
  });

  it("ungroup removes the groups (the menu's Ungroup, Ctrl+Shift+G) – the boxes and their places stay", () => {
    const first = ok(edit({ edit: "group", boxes: [a] })).content;
    const both = ok(edit({ edit: "group", boxes: [b, c] }, first)).content;
    const placed = ok(edit({ edit: "place", positions: { [a]: { x: 16, y: 16 } } }, both)).content;
    const one = edit({ edit: "ungroup", groups: ["group-1"] }, placed);
    expect(canvasOf(one)).toEqual({ groups: [{ id: "group-2", label: "group 2", members: [b, c], colour: GROUP_COLOURS[1] }], positions: { [a]: { x: 16, y: 16 } } });
    expect(ok(one).words).toBe("group 1 ungrouped – the boxes stay where they are.");
    // Ctrl+Shift+G with boxes of both groups selected: both go in one op
    const all = edit({ edit: "ungroup", groups: ["group-1", "group-2"] }, placed);
    expect(canvasOf(all)).toEqual({ positions: { [a]: { x: 16, y: 16 } } });
    expect(ok(all).words).toBe("2 groups ungrouped – the boxes stay where they are.");
    expect(edit({ edit: "ungroup", groups: ["group-9"] }, placed)).toEqual({ ok: false, reason: "That group is not there any more." });
    expect(edit({ edit: "ungroup", groups: [] }, placed)).toMatchObject({ ok: false });
    expect(edit({ edit: "ungroup", groups: ["group-1"] }, placed, { level: "group", group: "ch1" })).toMatchObject({ ok: false });
  });
});

describe("notes on the canvas (#334, schema 5.3 – the deck's notes)", () => {
  const notesOf = (result: OpResult) => canvasOf(result)?.notes;

  it("adds an empty note free at a point, or beside a box by its author", () => {
    const free = edit({ edit: "note", at: { x: 37, y: -9 }, author: " tilman " });
    expect(notesOf(free)).toEqual([{ id: "note-1", text: "", x: 32, y: -16, author: "tilman" }]);
    expect(ok(free).words).toBe("A note – type its text.");
    const beside = edit({ edit: "note", box: a }, ok(free).content);
    expect(notesOf(beside)![1]).toEqual({ id: "note-2", text: "", x: NOTE_BESIDE.x, y: NOTE_BESIDE.y, box: a });
    // A second note beside the same box stands below the first
    expect(notesOf(edit({ edit: "note", box: a }, ok(beside).content))![2]).toMatchObject({ id: "note-3", box: a, y: NOTE_BESIDE.y + 5 * GRID });
    expect(edit({ edit: "note", box: "rule:nowhere" })).toMatchObject({ ok: false });
    expect(edit({ edit: "note" })).toMatchObject({ ok: false });
    expect(edit({ edit: "note", at: { x: 0, y: 0 } }, content, { level: "group", group: "ch1" })).toMatchObject({ ok: false });
  });

  it("writes a note's text; an empty text removes it", () => {
    const added = ok(edit({ edit: "note", at: { x: 0, y: 0 } })).content;
    const written = edit({ edit: "noteText", note: "note-1", text: "  Why the hint waits for the key  " }, added);
    expect(notesOf(written)).toEqual([{ id: "note-1", text: "Why the hint waits for the key", x: 0, y: 0 }]);
    expect(ok(written).words).toBe("Note written.");
    expect(edit({ edit: "noteText", note: "note-1", text: "Why the hint waits for the key" }, ok(written).content)).toMatchObject({ ok: false });
    const removed = edit({ edit: "noteText", note: "note-1", text: " " }, ok(written).content);
    expect(canvasOf(removed)).toBeUndefined();
    expect(ok(removed).words).toBe("Note removed.");
    expect(edit({ edit: "noteText", note: "note-9", text: "x" }, added)).toEqual({ ok: false, reason: "That note is not here any more." });
  });

  it("moves a note with place (note:<id>), boxes and notes in one op", () => {
    const added = ok(edit({ edit: "note", at: { x: 0, y: 0 } })).content;
    const moved = edit({ edit: "place", positions: { "note:note-1": { x: 70, y: 33 }, [a]: { x: 0, y: 0 } } }, added);
    expect(canvasOf(moved)).toEqual({ notes: [{ id: "note-1", text: "", x: 64, y: 32 }], positions: { [a]: { x: 0, y: 0 } } });
    expect(ok(moved).words).toMatch(/and a note moved/);
    expect(canvasOf(edit({ edit: "place", positions: { "note:note-1": { x: 16, y: 0 } } }, added))).toEqual({ notes: [{ id: "note-1", text: "", x: 16, y: 0 }] });
    expect(edit({ edit: "place", positions: { "note:note-9": { x: 0, y: 0 } } }, added)).toMatchObject({ ok: false });
  });

  it("draws a free note where it stands and a box's note beside its box, joined by a dotted line", () => {
    const canvas: LogicCanvas = {
      positions: { [a]: { x: 160, y: 320 } },
      notes: [{ id: "note-1", text: "free", x: 48, y: -64 }, { id: "note-2", text: "beside", x: NOTE_BESIDE.x, y: 16, box: a, author: "tilman" },
        { id: "note-3", text: "in the door's own view", x: 0, y: 0, view: "door" }],
    };
    const flow = flowOf(view, canvas);
    expect(flow.notes.map(n => n.id)).toEqual(["note-1", "note-2"]);
    expect(flow.notes[0]).toEqual({ id: "note-1", text: "free", x: 48, y: -64 });
    expect(flow.notes[1]).toMatchObject({ x: 160 + NOTE_BESIDE.x, y: 336, box: a, author: "tilman", link: { target: a, sourceHandle: "note:l", targetHandle: "ref:r" } });
    // A note is no logic: no box, no wire
    expect(flow.boxes.some(x => x.id.startsWith("note"))).toBe(false);
    expect(flow.wires.length).toBe(flowOf(view).wires.length);
    // The target's own level draws its view's notes only
    const entity = flowOf(project(content, { level: "entity", scene: "door", target: "door", path: [] }), canvas);
    expect(entity.notes.map(n => n.id)).toEqual(["note-3"]);
    expect(noteView({ level: "entity", scene: "door", target: "door", path: [0, 1] })).toBe("door/0.1");
  });

  it("a note made at a target's level belongs to that view", () => {
    const at: Context = { level: "entity", scene: "door", target: "door", path: [] };
    const added = edit({ edit: "note", at: { x: 0, y: 0 } }, content, at);
    expect(notesOf(added)).toEqual([{ id: "note-1", text: "", x: 0, y: 0, view: "door" }]);
    // The scene's level does not edit it
    expect(edit({ edit: "noteText", note: "note-1", text: "x" }, ok(added).content)).toMatchObject({ ok: false });
  });

  it("a removed rule's note stays free where it stood; a later rule's note follows its rule", () => {
    const canvas: LogicCanvas = {
      positions: { [a]: { x: 160, y: 320 } },
      notes: [{ id: "note-1", text: "on a", x: NOTE_BESIDE.x, y: 16, box: a }, { id: "note-2", text: "on b", x: NOTE_BESIDE.x, y: 0, box: b }],
    };
    const withNotes: LogicContent = { ...content, scenes: content.scenes.map(s => (s.id === "door" ? { ...s, canvas } : s)) };
    const home = view.nodes.find(n => n.id === a)!.home!;
    const removed = ok(apply({ op: "removeRule", home }, withNotes, scene));
    const notes = removed.content.scenes.find(s => s.id === "door")!.canvas!.notes!;
    expect(notes[0]).toEqual({ id: "note-1", text: "on a", x: 160 + NOTE_BESIDE.x, y: 336 });
    // b was the rule after a: it is rule #0 now, and its note goes with it
    expect(notes[1]).toEqual({ id: "note-2", text: "on b", x: NOTE_BESIDE.x, y: 0, box: a });
    expect(removed.canvas.some(change => change.doc === "scene" && change.scene === "door")).toBe(true);
    expect(canvasProblems(removed.content.scenes.find(s => s.id === "door")!.canvas, "c")).toEqual([]);
  });

  it("writes notes the shared guard accepts", () => {
    const one = ok(edit({ edit: "note", at: { x: 0, y: 0 }, author: "tilman" })).content;
    const two = ok(edit({ edit: "note", box: a }, one));
    expect(canvasProblems(canvasOf(two), "c")).toEqual([]);
  });
});

describe("a plugin's display rows (#334, Tilman 2026-11-21)", () => {
  it("are text rows with reference lines – never wires – and the card is tall enough for them", () => {
    const flow = flowOf(view);
    const plugin = flow.boxes.find(b => b.id === "plugin:narrative")!;
    // Two pins (listens, emits), then the rows below the divider
    expect(plugin.ports.map(p => p.id)).toEqual(["listens", "emits"]);
    expect(plugin.rows).toEqual([{ id: "sets", text: "sets doorOpen" }, { id: "drives", text: "drives door" }]);
    expect(plugin.h).toBe(boxHeight(plugin.ports, false, 2));
    expect(plugin.h).toBeGreaterThan(boxHeight(plugin.ports));
    // Each row's name reaches its box by a reference line from the row's side that faces it – not a wire
    expect(flow.refs.map(r => `${r.source} ${r.sourceHandle} > ${r.target}`).sort()).toEqual([
      expect.stringMatching(/^plugin:narrative ref:[lr]:drives > node:door\/$/),
      expect.stringMatching(/^plugin:narrative ref:[lr]:sets > var:doorOpen$/),
    ]);
    expect(flow.wires.some(w => w.source === "plugin:narrative" && (w.target === "var:doorOpen" || w.target === "node:door/"))).toBe(false);
    expect(flow.wires.some(w => w.sourcePort.includes("sets") || w.sourcePort.includes("drives"))).toBe(false);
    // Folded, the line starts at the head
    const folded = flowOf(view, { folds: ["plugin:narrative"] });
    expect(folded.refs.every(r => r.sourceHandle === "ref:hl" || r.sourceHandle === "ref:hr")).toBe(true);
  });
});
