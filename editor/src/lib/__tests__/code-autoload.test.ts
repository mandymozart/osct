import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunResult } from "../stage/frame-protocol";

/**
 * The Code tab's code on the live stage (#269): a frame that starts gets every stored source by itself – each one's
 * status says whether it runs, saved or with edits, or failed and why; a source that hung the stage is skipped the
 * next time; the pickers name why a type is missing.
 */

const SOURCES: Record<string, string> = {
  lifts: "export const register = api => { api.log('lifts'); };",
  reveal: "export const register = api => { api.log('reveal'); };",
  broken: "export const register = api => { api.log( };",
};

vi.mock("../api", async original => ({
  ...(await original<typeof import("../api")>()),
  listPlugins: async () => ({ plugins: Object.keys(SOURCES).sort().map(id => ({ id, size: 1, usages: 0, updatedAt: "", updatedBy: null })) }),
  getPlugin: async (_book: string, id: string) => ({ plugin: { id, source: SOURCES[id], size: 1, updatedAt: "", updatedBy: null } }),
  putPlugin: async (_book: string, id: string, source: string) => ({ plugin: { id, source, size: 1, updatedAt: "", updatedBy: null } }),
}));

const { plugins, AUTO_LOAD_TIMEOUT_MS } = await import("../plugins.svelte");

/** The frame's side: what each plugin's run answers, and every run and refresh it was asked for */
class FakeStage {
  runs: string[] = [];
  refreshes = 0;
  constructor(private answer: (id: string) => RunResult | "hang" = () => ({ ok: true, types: [] })) {}
  async runPlugin(id: string, _code: string, timeoutMs?: number): Promise<RunResult> {
    this.runs.push(id);
    const answer = this.answer(id);
    if (answer !== "hang") return answer;
    return { ok: false, error: `the stage did not answer within ${Math.round((timeoutMs ?? 0) / 1000)} s` };
  }
  async refresh(): Promise<void> {
    this.refreshes += 1;
  }
  treeOf() { return undefined; }
  overrideOf() { return undefined; }
  async override(): Promise<void> {}
}

let book = 0;
/** Every test a book of its own: the store starts clean for it */
const nextBook = () => `book-${++book}`;

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("the saved sources load by themselves when the stage starts", () => {
  it("every stored source runs, the scene is built once, the broken one says why", async () => {
    const stage = new FakeStage();
    const version = plugins.version;
    await plugins.autoLoad(nextBook(), stage);
    // The broken one never reaches the frame: it does not transpile
    expect(stage.runs).toEqual(["lifts", "reveal"]);
    expect(stage.refreshes).toBe(1);
    expect(plugins.version).toBe(version + 1);
    expect(plugins.status.get("lifts")).toEqual({ state: "saved" });
    expect(plugins.status.get("reveal")).toEqual({ state: "saved" });
    expect(plugins.status.get("broken")).toMatchObject({ state: "failed" });
    expect(plugins.failed().map(f => f.id)).toEqual(["broken"]);
    expect(plugins.missingNote()).toBe("not loaded – broken failed");
  });

  it("a run the frame refuses is the source's failure", async () => {
    const stage = new FakeStage(id => (id === "reveal" ? { ok: false, error: "register failed – boom" } : { ok: true, types: [] }));
    await plugins.autoLoad(nextBook(), stage);
    expect(plugins.status.get("reveal")).toEqual({ state: "failed", error: "register failed – boom" });
    expect(plugins.status.get("lifts")).toEqual({ state: "saved" });
  });

  it("a source the stage does not answer for is skipped at the next open, once", async () => {
    const id = nextBook();
    await plugins.autoLoad(id, new FakeStage(p => (p === "lifts" ? "hang" : { ok: true, types: [] })));
    expect(plugins.status.get("lifts")).toEqual({ state: "failed", error: `the stage did not answer within ${AUTO_LOAD_TIMEOUT_MS / 1000} s` });
    expect(window.localStorage.getItem(`osct-code-autoload:${id}`)).toBe("lifts");
    // The frame is likely still in it: the rest wait
    expect(plugins.status.get("reveal")).toEqual({ state: "failed", error: "not loaded – the stage stopped answering at lifts" });
    // The page reloaded (it froze): the next start skips it and says why
    const next = new FakeStage();
    await plugins.autoLoad(id, next);
    expect(next.runs).toEqual(["reveal"]);
    expect(plugins.status.get("lifts")).toMatchObject({ state: "skipped" });
    expect(window.localStorage.getItem(`osct-code-autoload:${id}`)).toBeNull();
    // …and the one after that tries it again
    const again = new FakeStage();
    await plugins.autoLoad(id, again);
    expect(again.runs).toEqual(["lifts", "reveal"]);
  });

  it("a page that froze in the middle of a run (the mark left behind) skips that source", async () => {
    const id = nextBook();
    window.localStorage.setItem(`osct-code-autoload:${id}`, "reveal");
    const stage = new FakeStage();
    await plugins.autoLoad(id, stage);
    expect(stage.runs).toEqual(["lifts"]);
    expect(plugins.status.get("reveal")).toMatchObject({ state: "skipped", error: expect.stringContaining("hung the stage") });
  });
});

describe("a Run and a Save keep the status", () => {
  it("unsaved edits run as edits; the saved text runs as saved; a new frame gets what ran here", async () => {
    const id = nextBook();
    const stage = new FakeStage();
    await plugins.autoLoad(id, stage);
    const edited = SOURCES.reveal.replace("'reveal'", "'reveal, edited'");
    expect(await plugins.run("reveal", edited, stage)).toBe(true);
    expect(plugins.status.get("reveal")).toEqual({ state: "edits" });
    // A new frame (a reload): the edits run there again, not the stored text
    const frame = new FakeStage();
    const sources: string[] = [];
    const run = frame.runPlugin.bind(frame);
    frame.runPlugin = async (plugin, code, timeout) => {
      if (plugin === "reveal") sources.push(code);
      return run(plugin, code, timeout);
    };
    await plugins.autoLoad(id, frame);
    expect(sources[0]).toContain("reveal, edited");
    expect(plugins.status.get("reveal")).toEqual({ state: "edits" });
    // Saved, the same text is the saved version
    await plugins.save(id, "reveal", edited);
    expect(await plugins.run("reveal", edited, stage)).toBe(true);
    expect(plugins.status.get("reveal")).toEqual({ state: "saved" });
  });

  it("a Run that fails marks the source failed (what ran before stays registered)", async () => {
    const id = nextBook();
    const stage = new FakeStage();
    await plugins.autoLoad(id, stage);
    expect(await plugins.run("lifts", "export const register = api => {", stage)).toBe(false);
    expect(plugins.status.get("lifts")).toMatchObject({ state: "failed" });
    expect(plugins.runError?.plugin).toBe("lifts");
    plugins.runError = null;
  });
});

describe("why a type is missing", () => {
  it("loading, failed or nobody's", async () => {
    const stage = new FakeStage();
    const loading = plugins.autoLoad(nextBook(), stage);
    expect(plugins.missingNote()).toBe("loading the book's code…");
    await loading;
    plugins.status.clear();
    expect(plugins.missingNote()).toBe("unknown – no plugin registers it");
  });
});
