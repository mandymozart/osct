import { describe, expect, it } from "vitest";
import type { EntityData } from "@engine/types";
import { componentRows, componentTypesFor, contentEntity, getValue, setValue, valueRows } from "../values";

/** An entity's own looks (#268): the components reveal, found and lost – a look row, then the rows of the look it names */

const entity = (components: EntityData["components"]): EntityData => ({ type: "group", assets: [], components });

describe("the rows of a moment's component", () => {
  it("a component without a look has the look row alone – it plays the book's", () => {
    const rows = componentRows({ type: "reveal" }, 0);
    expect(rows.map(row => row.id)).toEqual(["components.0.look"]);
    expect(rows[0]).toMatchObject({ kind: "choice", default: "" });
    expect(rows[0].options).toEqual(["", "inflateDissolve", "printLift", "fade"]);
  });

  it("a component with a look adds the look's rows, under the component's own index", () => {
    const rows = componentRows({ type: "found", look: "printLift" }, 2);
    expect(rows[0].id).toBe("components.2.look");
    expect(rows.slice(1, 3).map(row => [row.id, row.label])).toEqual([["components.2.duration", "appear"], ["components.2.outDuration", "disappear"]]);
    expect(rows.length).toBeGreaterThan(20);
    // the defaults are the look's: printLift appears in 1100 ms
    expect(rows.find(row => row.id === "components.2.duration")).toMatchObject({ kind: "number", default: 1100 });
    // a look nobody knows has no rows of its own
    expect(componentRows({ type: "lost", look: "swirl" }, 0).map(row => row.id)).toEqual(["components.0.look"]);
  });

  it("a value is read from the component and written next to the look", () => {
    const node = entity([{ type: "reveal", look: "printLift", duration: 900 }]);
    const duration = valueRows(node, true).find(row => row.id === "components.0.duration")!;
    expect(getValue(node, duration)).toBe(900);
    expect(getValue(node, valueRows(node, true).find(row => row.id === "components.0.outDuration")!)).toBe(600);
    expect(setValue(node, duration, 1200).components).toEqual([{ type: "reveal", look: "printLift", duration: 1200 }]);
  });

  it("another look starts the moment with the look alone – the old look's parameters do not carry over", () => {
    const node = entity([{ type: "reveal", look: "printLift", duration: 900, tint: 0.5 }, { type: "lost", look: "fade" }]);
    const look = componentRows(node.components![0], 0)[0];
    expect(setValue(node, look, "fade").components).toEqual([{ type: "reveal", look: "fade" }, { type: "lost", look: "fade" }]);
    expect(setValue(node, look, "").components?.[0]).toEqual({ type: "reveal", look: "" });
  });

  it("the content keeps the values that differ from the look's defaults, and an empty look as no look", () => {
    const node = entity([{ type: "found", look: "fade", duration: 600, outDuration: 250 }, { type: "lost", look: "" }]);
    expect(contentEntity(node, true).components).toEqual([{ type: "found", look: "fade", outDuration: 250 }, { type: "lost" }]);
  });

  it("the moments are offered as components to add", () => {
    expect(componentTypesFor("group")).toEqual(expect.arrayContaining(["reveal", "found", "lost"]));
    expect(componentTypesFor("model")).toEqual(expect.arrayContaining(["reveal", "found", "lost", "animation"]));
  });
});
