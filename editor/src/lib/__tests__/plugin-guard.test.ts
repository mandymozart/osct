import { beforeEach, describe, expect, it } from "vitest";
import { answerKey, declinedReason, foreignSources, readAnswers, whoName } from "../plugin-guard";
import { pluginGuard } from "../plugin-guard.svelte";

/**
 * The guard before others' plugin code (#340): the stage runs plugins in the editor's page, with the signed-in editor's
 * session – code someone else saved last runs only after the person said Run, once per experience and source version.
 */

const ME = "ana@example.org";
const stored = [
  { id: "mine", updatedAt: "2026-11-21T10:00:00Z", updatedBy: ME, size: 10 },
  { id: "bens", updatedAt: "2026-11-21T11:00:00Z", updatedBy: "ben@example.org", size: 20 },
  { id: "orphan", updatedAt: "2026-11-20T09:00:00Z", updatedBy: null, size: 30 },
];
const declared = [
  { id: "bens", src: "https://cdn.example/x/plugins/bens/plugin-aaa.js" },
  { id: "imported", src: "https://cdn.example/x/plugins/imported/plugin.js" },
];

beforeEach(() => window.localStorage.clear());

describe("who the guard asks about", () => {
  it("leaves the person's own last save alone; asks for others', a gone account's and an imported module without a source", () => {
    const sources = foreignSources(stored, declared, "Ana@Example.org");
    expect(sources.map(s => [s.id, s.kind, s.savedBy])).toEqual([
      ["bens", "saved", "ben@example.org"],
      ["orphan", "saved", null],
      ["imported", "declared", null],
    ]);
  });

  it("names a person by the local part of their address", () => {
    expect(whoName("ben@example.org")).toBe("ben");
    expect(whoName(null)).toBe("an account no longer on this instance");
  });

  it("knows a source's version: another save, by someone else, is another version", () => {
    const [before] = foreignSources(stored, [], ME);
    const [after] = foreignSources([{ ...stored[1], updatedAt: "2026-11-21T12:00:00Z" }], [], ME);
    expect(answerKey(before)).not.toBe(answerKey(after));
  });

  it("asks nothing when the person saved everything last", () => {
    expect(foreignSources([stored[0]], [{ id: "mine", src: "x" }], ME)).toEqual([]);
  });
});

describe("the prompt", () => {
  const check = (s = stored, options?: { ask?: boolean }) => pluginGuard.check("demo", s, declared, ME, options);

  it("asks once for all of them; Run keeps the answer per version, and a new save by someone else asks again", async () => {
    const first = check();
    await Promise.resolve();
    expect(pluginGuard.asking?.sources.map(s => s.id)).toEqual(["bens", "orphan", "imported"]);
    pluginGuard.answer("run");
    expect(await first).toEqual(new Map());
    expect(pluginGuard.asking).toBeNull();
    // The same versions: no prompt
    expect(await check()).toEqual(new Map());
    // Ben saves again: only that one is asked
    const again = check([stored[0], { ...stored[1], updatedAt: "2026-11-22T08:00:00Z" }, stored[2]]);
    await Promise.resolve();
    expect(pluginGuard.asking?.sources.map(s => s.id)).toEqual(["bens"]);
    pluginGuard.answer("skip");
    const declined = await again;
    expect([...declined.keys()]).toEqual(["bens"]);
    expect(declined.get("bens")).toBe("ben saved it last and you chose Don't run – Run in the Code tab runs it now");
  });

  it("Don't run is kept too, and says why for each plugin", async () => {
    const first = check();
    await Promise.resolve();
    pluginGuard.answer("skip");
    const declined = await first;
    expect([...declined.keys()]).toEqual(["bens", "orphan", "imported"]);
    expect(declined.get("imported")).toMatch(/came with the imported content/);
    expect([...(await check()).keys()]).toEqual(["bens", "orphan", "imported"]);
  });

  it("closing the workspace while it asks runs nothing and keeps no answer", async () => {
    const first = check();
    await Promise.resolve();
    pluginGuard.dismiss();
    expect([...(await first).keys()]).toEqual(["bens", "orphan", "imported"]);
    expect(readAnswers("demo")).toEqual({});
  });

  it("without anyone to ask (the render view) runs only what was answered Run before", async () => {
    const declined = await check(stored, { ask: false });
    expect(pluginGuard.asking).toBeNull();
    expect([...declined.keys()]).toEqual(["bens", "orphan", "imported"]);
    expect(readAnswers("demo")).toEqual({});
  });

  it("words why a declared module did not run", () => {
    expect(declinedReason({ id: "x", kind: "declared", savedBy: null, version: "u" })).toMatch(/nobody here saved it/);
  });
});
