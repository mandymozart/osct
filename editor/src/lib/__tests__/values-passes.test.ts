import { describe, expect, it } from "vitest";
import { passOptionLabels, passRows, passValue, setPassValue } from "../values";

describe("the post-processing panel's grade rows", () => {
  const reach = passRows({ type: "grade" }, 0).find(row => row.id === "passes.0.reach")!;

  it("have a choice row for the reach, first, with its words", () => {
    expect(passRows({ type: "grade" }, 0).map(row => row.id)).toEqual(["passes.0.reach", "passes.0.exposure", "passes.0.contrast", "passes.0.saturation", "passes.0.tint"]);
    expect(reach).toMatchObject({ kind: "choice", options: ["ar", "all"], default: "ar" });
    expect(passOptionLabels({ type: "grade" }, reach)).toEqual({ ar: "AR layer", all: "whole picture" });
    expect(passOptionLabels({ type: "bloom" }, passRows({ type: "bloom" }, 0)[0])).toEqual({});
  });

  it("read the default, write the whole picture, drop the default again", () => {
    expect(passValue({ type: "grade" }, reach)).toBe("ar");
    const all = setPassValue({ type: "grade", exposure: 1 }, reach, "all");
    expect(all).toEqual({ type: "grade", exposure: 1, reach: "all" });
    expect(passValue(all, reach)).toBe("all");
    expect(setPassValue(all, reach, "ar")).toEqual({ type: "grade", exposure: 1 });
  });
});
