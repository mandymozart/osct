import { describe, expect, it } from "vitest";
import { parseNumber } from "../values";
import { parseValue } from "../behaviour-edit";

describe("the editor's one number parser (#212)", () => {
  it("takes a comma or a dot as the decimal point", () => {
    expect(parseNumber("1,5")).toBe(1.5);
    expect(parseNumber("1.5")).toBe(1.5);
    expect(parseNumber(" -0,25 ")).toBe(-0.25);
    expect(parseNumber("+3")).toBe(3);
    expect(parseNumber(",5")).toBe(0.5);
    expect(parseNumber("2.")).toBe(2);
  });

  it("refuses an exponent, thousands separators and anything else", () => {
    for (const text of ["1e3", "1E-2", "1.000,5", "1,000,5", "1 000", "", " ", "-", ".", "abc", "Infinity", "NaN", "0x10", "1,5mm"]) {
      expect(parseNumber(text)).toBeNull();
    }
  });

  it("reads a behaviour rule's value the same way – what is no number stays text", () => {
    expect(parseValue("1,5")).toBe(1.5);
    expect(parseValue("1.5")).toBe(1.5);
    expect(parseValue("1e3")).toBe("1e3");
    expect(parseValue("1.000,5")).toBe("1.000,5");
  });
});
