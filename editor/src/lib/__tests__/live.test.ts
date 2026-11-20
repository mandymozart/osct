import { describe, expect, it } from "vitest";
import { liveLabels, liveShort } from "../live";

// Where an experience is live: the environments that serve a build of it (each experience has its own store there, #87)
describe("live experience", () => {
  it("an experience no environment serves is draft only", () => {
    expect(liveLabels([])).toEqual(["draft only"]);
    expect(liveLabels(undefined)).toEqual(["draft only"]);
    expect(liveShort([])).toBe("draft only");
  });

  it("names each environment with its build", () => {
    const labels = liveLabels([
      { env: "staging", build: "1a2b3c4d5e6f", since: "2026-10-30T10:00:00.000Z" },
      { env: "production", build: "abcdefabcdef", since: null },
    ]);
    expect(labels[0]).toMatch(/^live on staging · build 1a2b3c4d5e6f · since /);
    expect(labels[1]).toBe("live on production · build abcdefabcdef");
    expect(liveShort([{ env: "staging", build: null, since: null }, { env: "production", build: null, since: null }])).toBe("live on staging, production");
  });
});
