import { describe, expect, it } from "vitest";
import type { Target } from "@engine/types";
import { formatVar, initialValue, numberStep, tapTargets, varType, withTypes } from "../narrative";

describe("the Inspector's variables: types and typed text", () => {
  it("names a value's type as the plugin API's scalars", () => {
    expect(varType(true)).toBe("boolean");
    expect(varType(0)).toBe("number");
    expect(varType("")).toBe("string");
    expect(withTypes([{ scope: "book", name: "hasKey", value: true }, { scope: "spread", name: "count", value: 2 }])).toEqual([
      { scope: "book", name: "hasKey", value: true, type: "boolean" },
      { scope: "spread", name: "count", value: 2, type: "number" },
    ]);
  });

  it("shows a value in a text field as it is", () => {
    expect(formatVar(" open ")).toBe(" open ");
    expect(formatVar(1.25)).toBe("1.25");
  });

  it("starts a new variable with a value of its type", () => {
    expect(initialValue("boolean")).toBe(true);
    expect(initialValue("number")).toBe(0);
    expect(initialValue("string")).toBe("");
  });

  it("scrubs a number as fine as its decimals", () => {
    expect(numberStep(3)).toBe(1);
    expect(numberStep(0.5)).toBe(0.1);
    expect(numberStep(1.25)).toBe(0.01);
    expect(numberStep(Math.PI)).toBe(0.001);
  });
});

describe("tapTargets: the tap buttons", () => {
  const target = (id: string, extra: Partial<Target> = {}): Target => ({ id, entryId: id, spreadId: "s", imageSrc: `/${id}.jpg`, ...extra });
  const entries = [
    { title: "The key", target: target("key") },
    { title: "A note without target" },
    { title: "", target: target("tally") },
    { title: "Not printed", target: target("ghost", { imageSrc: "" }) },
    { title: "The lamp", target: target("lamp") },
  ];

  it("lists the printed targets in page order, labelled by their entry", () => {
    expect(tapTargets(entries, [], () => true).map(t => [t.id, t.label])).toEqual([["key", "The key"], ["tally", "tally"], ["lamp", "The lamp"]]);
  });

  it("lets only a found target with AR content take a tap", () => {
    const taps = tapTargets(entries, ["key", "tally"], t => t.id !== "tally");
    expect(taps.map(t => [t.id, t.tappable])).toEqual([["key", true], ["tally", false], ["lamp", false]]);
  });
});
