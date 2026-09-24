import { decode } from "@msgpack/msgpack";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import config from "@/game.config.json";
import { getAssets, getEntries, getMaxTargetsPerSpread, getSpread, getSpreads } from "@/utils/game-config";

/**
 * Guards the built content (`game.config.json`) written by the content build.
 * Runs against the real data, so broken content fails here before it fails in the browser.
 */

const publicDir = resolve(__dirname, "../../../public");
const publicFile = (src: string) => resolve(publicDir, src.replace(/^\//, ""));

type MindFile = { dataList: { targetImage: { width: number; height: number } }[] };

describe("content config", () => {
  const spreads = getSpreads();

  it("carries the content build checksum", () => {
    expect(config.version.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("has an existing initial spread", () => {
    expect(getSpread(config.initialSpreadId)).toBeDefined();
  });

  it("has unique spread and target ids", () => {
    const spreadIds = spreads.map(c => c.id);
    const targetIds = spreads.flatMap(c => c.targets.map(t => t.id));
    expect(new Set(spreadIds).size).toBe(spreadIds.length);
    expect(new Set(targetIds).size).toBe(targetIds.length);
  });

  it("uses the shared target limit (RULES.md #3)", () => {
    expect(getMaxTargetsPerSpread()).toBe(5);
  });

  it.each(spreads.map(c => [c.id, c] as const))(
    "%s stays within the target limit and indexes its targets 0..n-1",
    (_id, spread) => {
      expect(spread.targets.length).toBeLessThanOrEqual(getMaxTargetsPerSpread());
      expect(spread.targets.map(t => t.mindarTargetIndex)).toEqual(spread.targets.map((_, i) => i));
    },
  );

  // MindAR matches by position: entry i of the spread .mind must be the image of the target with
  // mindarTargetIndex i. A stale .mind silently shows the wrong AR content on a page.
  it.each(spreads.map(c => [c.id, c] as const))(
    "%s .mind contains exactly its targets, in order",
    (_id, spread) => {
      const size = (src: string) => {
        const { dataList } = decode(readFileSync(publicFile(src))) as MindFile;
        return dataList.map(({ targetImage: { width, height } }) => `${width}x${height}`);
      };

      const spreadImages = size(spread.mindSrc);
      const targetImages = [...spread.targets]
        .sort((a, b) => a.mindarTargetIndex - b.mindarTargetIndex)
        .map(t => size(t.mindSrc!)[0]);

      expect(spreadImages).toEqual(targetImages);
    },
  );

  it("references files that exist in public/", () => {
    const files = [
      ...spreads.map(c => c.mindSrc),
      ...spreads.flatMap(c => c.targets.map(t => t.imageTargetSrc)),
      ...getAssets().map(a => a.src),
      ...getEntries().map(e => e.image),
    ].filter(src => src && !/^https?:\/\//.test(src)) as string[]; // links point to external URLs

    const missing = files.filter(src => !existsSync(publicFile(src)));
    expect(missing).toEqual([]);
  });

  describe("entries", () => {
    const entries = getEntries();
    const targets = spreads.flatMap(s => s.targets.map(t => ({ ...t, spread: s })));

    it("have unique ids and a known category", () => {
      expect(new Set(entries.map(e => e.id)).size).toBe(entries.length);
      for (const entry of entries) {
        expect(["glossary", "videos", "texts", "links"]).toContain(entry.category);
      }
    });

    // Taxonomy (RULES.md #7): every target reveals exactly one entry; entries may have no target.
    it("link 1:1 with targets", () => {
      for (const target of targets) {
        const linked = entries.filter(e => e.targetId === target.id);
        expect(linked.map(e => e.id), target.id).toEqual([target.entryId]);
      }
    });

    it("with a target sit on a page of the target's spread", () => {
      for (const entry of entries.filter(e => e.targetId)) {
        const target = targets.find(t => t.id === entry.targetId)!;
        expect(entry.spreadId).toBe(target.spread.id);
        expect(entry.page).toBeGreaterThanOrEqual(target.spread.firstPage);
        expect(entry.page).toBeLessThanOrEqual(target.spread.lastPage);
      }
    });

    it("cover every category", () => {
      expect(new Set(entries.map(e => e.category))).toEqual(new Set(["glossary", "videos", "texts", "links"]));
    });
  });
});
