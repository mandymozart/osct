import { afterEach, describe, expect, it } from "vitest";
import { cyclePreparedSpreadRange, getPreparedSpreadRange } from "../prepared-spreads";

describe("spreads kept loaded", () => {
  afterEach(() => localStorage.removeItem("osct-ar-prepared-spreads"));

  it("keeps the neighbours loaded by default and cycles the range through to the whole book", () => {
    expect(getPreparedSpreadRange()).toBe(1);
    expect([cyclePreparedSpreadRange(), cyclePreparedSpreadRange(), cyclePreparedSpreadRange()]).toEqual([2, Infinity, 0]);
    expect(localStorage.getItem("osct-ar-prepared-spreads")).toBe("0");
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem("osct-ar-prepared-spreads", "7");
    expect(getPreparedSpreadRange()).toBe(1);
  });
});
