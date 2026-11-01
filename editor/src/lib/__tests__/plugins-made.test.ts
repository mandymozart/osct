import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesh } from "three";
import type { EntityData, Target } from "@engine/types";
import { buildEntity, type EntityInstance } from "@engine/scene/entities";
import { installedPlugins, uninstallPlugin } from "@engine/scene/plugins";
import { plugins } from "../plugins.svelte";
import { nodeTypeCode } from "../plugins/make-code";
import { runPluginCode } from "../stage/plugin-run";

/**
 * A node made code on the stage (#199): it keeps its old type until the made code builds it – a failed build is the
 * Run's error (the Code tab's) – and a Run builds a node whose type failed before anew.
 */

const AQUARIUM = readFileSync(resolve(process.cwd(), "../fixtures/demo/plugins/aquarium/index.ts"), "utf8");
const TANK: EntityData = { type: "group", assets: [], children: [{ type: "aquarium", name: "Tank", assets: [], params: { fish: 3 } }] };

/**
 * The stage's part a Run touches: the frame's runner (here in the test's own realm, so the registry is the one the
 * test reads), overrides over the draft's trees, each change and a refresh building the target anew
 */
class FakeStage {
  overrides = new Map<string, EntityData>();
  built = new Map<string, EntityInstance | null>();
  constructor(private draft: Map<string, EntityData>) {}
  treeOf(id: string): EntityData | undefined {
    return this.overrides.get(id) ?? this.draft.get(id);
  }
  overrideOf(id: string): EntityData | undefined {
    return this.overrides.get(id);
  }
  async override(id: string, entity: EntityData | null): Promise<void> {
    if (entity) this.overrides.set(id, entity);
    else this.overrides.delete(id);
    this.build(id);
  }
  runPlugin(id: string, code: string) {
    return runPluginCode(id, code, importer);
  }
  async refresh(): Promise<void> {
    this.draft.forEach((_, id) => this.build(id));
  }
  private build(id: string): void {
    const entity = this.treeOf(id);
    const target: Target = { id, entryId: id, spreadId: "s", imageSrc: "/t.jpg", entity };
    this.built.set(id, entity ? buildEntity(target, () => undefined) : null);
  }
  /** The meshes shown for a target */
  meshes(id: string): number {
    let count = 0;
    this.built.get(id)?.object.traverse(child => { if ((child as Mesh).isMesh) count++; });
    return count;
  }
}

/** Blob URLs as the test's importer reads them: the module evaluated with its register returned */
const blobs = new Map<string, Blob>();
const importer = async (url: string): Promise<unknown> => {
  const code = await blobs.get(url)!.text();
  return { register: new Function(`${code.replace(/^export const register =/m, "const register =")}\nreturn register;`)() };
};

let stage: FakeStage;
beforeEach(async () => {
  vi.spyOn(URL, "createObjectURL").mockImplementation(blob => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  stage = new FakeStage(new Map([["t", TANK]]));
  expect(await plugins.run("aquarium", AQUARIUM, stage)).toBe(true);
});

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  plugins.pending = null;
  plugins.runError = null;
  vi.restoreAllMocks();
});

/** The aquarium made code, pending as the Inspector leaves it */
const makeTank = () => {
  const made = nodeTypeCode(TANK.children![0], { plugins: installedPlugins() }, { plugin: "aquarium", source: AQUARIUM });
  plugins.pending = { plugin: made.plugin, type: made.type, targetId: "t", path: [0], from: "aquarium", node: made.node };
  return made;
};

describe("a node made code switches on the stage once its code builds (#199)", () => {
  it("the aquarium made code runs and the node switches to the new type, its fish shown", async () => {
    const shown = stage.meshes("t");
    expect(shown).toBeGreaterThan(3);
    const made = makeTank();
    expect(await plugins.run(made.plugin, made.source, stage)).toBe(true);
    expect(stage.treeOf("t")!.children![0].type).toBe(made.type);
    expect(stage.meshes("t")).toBe(shown);
    expect(plugins.pending).toBeNull();
    expect(plugins.runError).toBeNull();
  });

  it("a made type whose build fails: its error is the Run's, the node stays the aquarium until a Run builds it", async () => {
    const made = makeTank();
    const shown = stage.meshes("t");
    // The made build throws (a name it uses is gone)
    const broken = made.source.replace("FISH_COLOURS.map(", "FISH_COLOURZ.map(");
    expect(await plugins.run(made.plugin, broken, stage)).toBe(false);
    expect(plugins.runError).toMatchObject({ plugin: made.plugin, line: null });
    expect(plugins.runError!.message).toMatch(/tankCode did not build – ReferenceError: FISH_COLOURZ is not defined/);
    expect(stage.treeOf("t")!.children![0].type).toBe("aquarium");
    expect(stage.overrideOf("t")).toBeUndefined();
    expect(stage.meshes("t")).toBe(shown);
    expect(plugins.pending?.plugin).toBe(made.plugin);
    // Fixed and run: the node switches
    expect(await plugins.run(made.plugin, made.source, stage)).toBe(true);
    expect(stage.treeOf("t")!.children![0].type).toBe(made.type);
    expect(stage.meshes("t")).toBe(shown);
    expect(plugins.pending).toBeNull();
  });

  it("a Run builds a node whose type failed before anew, and names a failed build", async () => {
    const made = makeTank();
    expect(await plugins.run(made.plugin, made.source, stage)).toBe(true);
    const shown = stage.meshes("t");
    const broken = made.source.replace("FISH_COLOURS.map(", "FISH_COLOURZ.map(");
    expect(await plugins.run(made.plugin, broken, stage)).toBe(false);
    expect(plugins.runError!.message).toMatch(/tankCode did not build on the stage – ReferenceError/);
    expect(stage.meshes("t")).toBe(0);
    expect(await plugins.run(made.plugin, made.source, stage)).toBe(true);
    expect(plugins.runError).toBeNull();
    expect(stage.meshes("t")).toBe(shown);
  });

  it("drops the switch when the node is no longer the one made code", async () => {
    const made = makeTank();
    stage.override("t", { type: "group", assets: [], children: [{ type: "text", assets: [], text: "other" }] });
    expect(await plugins.run(made.plugin, made.source, stage)).toBe(true);
    expect(plugins.pending).toBeNull();
    expect(stage.treeOf("t")!.children![0].type).toBe("text");
  });
});
