import { describe, expect, it, vi } from "vitest";

/** A book of nine spreads; s3 and s4 have no targets (switched off, or none yet) */
const empty = new Set(["s3", "s4"]);
const book = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}` }));
vi.mock("../../content/game-config", () => ({
  getSpreads: () => [...book],
  getTargets: (id: string) => (empty.has(id) ? [] : [{ id: `${id}-t` }]),
}));

const { getPreparedWindow } = await import("../prepared-spreads");
const ids = (spreadId: string, range: number, budget: number | null = null) => getPreparedWindow(spreadId, range, budget).map(spread => spread.id);

describe("the window of spreads kept ready", () => {
  it("counts spreads with targets only: one without is skipped and the range reaches past it", () => {
    expect(ids("s2", 1)).toEqual(["s5", "s1"]);
    expect(ids("s2", 2)).toEqual(["s5", "s1", "s6", "s0"]);
    expect(ids("s5", 2)).toEqual(["s6", "s2", "s7", "s1"]);
  });

  it("holds nothing next to the current spread at ±0, and every spread with targets at all", () => {
    expect(ids("s2", 0)).toEqual([]);
    expect(ids("s2", Infinity)).toEqual(["s5", "s1", "s6", "s0", "s7", "s8"]);
  });

  it("the load test's budget leaves spreads without targets out too", () => {
    expect(ids("s2", 1, 2)).toEqual(["s5", "s1"]);
  });
});
