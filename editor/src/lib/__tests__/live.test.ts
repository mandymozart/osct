import { describe, expect, it } from "vitest";
import { liveLabels, liveShort, replaceQuestion } from "../live";

// Each environment serves one book: where a book is live, and the question before a publish replaces another book
describe("live book", () => {
  it("a book no environment serves is draft only", () => {
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

  it("asks naming both books, production more strictly", () => {
    const staging = replaceQuestion("staging", "Demo", "Onion Skin & Crocodile Tears");
    expect(staging).toContain("Staging serves “Onion Skin & Crocodile Tears”. Publish “Demo” instead?");
    const production = replaceQuestion("production", "Demo", "Onion Skin & Crocodile Tears");
    expect(production).toContain("every reader");
    expect(production).toContain("Replace “Onion Skin & Crocodile Tears” with “Demo” on production?");
    expect(replaceQuestion("local", "Demo", null)).toContain("a book the editor cannot tell");
  });
});
