import { decode } from "@msgpack/msgpack";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  getAssets,
  getBook,
  getConfigVersion,
  getEntries,
  getInitialSpreadId,
  getMaxTargetsPerSpread,
  getSpread,
  getSpreads,
  getTarget,
  getTutorial,
} from "@/utils/game-config";

/**
 * Guards the game configuration (`game.config.json`) written by the content build.
 * Runs against the real data, so broken content fails here before it fails in the browser.
 * (Importing `@/utils/game-config` already runs `assertGameConfiguration`.)
 */

const srcDir = resolve(__dirname, "../..");
const publicDir = resolve(__dirname, "../../../public");
const publicFile = (src: string) => resolve(publicDir, src.replace(/^\//, ""));
const isLocal = (src?: string): src is string => !!src && !/^https?:\/\//.test(src);

type MindFile = { dataList: { targetImage: { width: number; height: number } }[] };

/** Width x height from a JPEG header (SOF marker) */
const jpegSize = (file: string): string => {
  const data = readFileSync(file);
  let offset = 2;
  while (offset < data.length) {
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return `${data.readUInt16BE(offset + 7)}x${data.readUInt16BE(offset + 5)}`;
    }
    offset += 2 + length;
  }
  throw new Error(`No JPEG size in ${file}`);
};

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listSourceFiles(path) : /\.ts$/.test(name) ? [path] : [];
  });

describe("game configuration", () => {
  const spreads = getSpreads();
  const entries = getEntries();

  it("carries the content build checksum and the book", () => {
    expect(getConfigVersion().hash).toMatch(/^[0-9a-f]{64}$/);
    expect(getBook().id).toBe("osct");
  });

  it("has an existing initial spread", () => {
    expect(getSpread(getInitialSpreadId())).toBeDefined();
  });

  it("uses the shared target limit (RULES.md #3)", () => {
    expect(getMaxTargetsPerSpread()).toBe(5);
  });

  it.each(spreads.map(s => [s.id, s] as const))(
    "%s stays within the target limit and indexes its targets 0..n-1",
    (_id, spread) => {
      expect(spread.targets.length).toBeLessThanOrEqual(getMaxTargetsPerSpread());
      expect(spread.targets.map(t => t.index)).toEqual(spread.targets.map((_, i) => i));
    },
  );

  // MindAR matches by position: image i of the spread .mind must be the image of the target with
  // index i. A stale .mind silently shows the wrong AR content on a page.
  it.each(spreads.map(s => [s.id, s] as const))(
    "%s .mind contains exactly its targets' images, in order",
    (_id, spread) => {
      const { dataList } = decode(readFileSync(publicFile(spread.mindSrc))) as MindFile;
      const mindImages = dataList.map(({ targetImage: { width, height } }) => `${width}x${height}`);
      expect(mindImages).toEqual(spread.targets.map(t => jpegSize(publicFile(t.imageSrc))));
    },
  );

  it("references files that exist in public/", () => {
    const files = [
      ...spreads.map(s => s.mindSrc),
      ...entries.map(e => e.image),
      ...entries.map(e => e.target?.imageSrc),
      ...getAssets().map(a => a.src),
    ].filter(isLocal); // links point to external URLs

    expect(files.filter(src => !existsSync(publicFile(src)))).toEqual([]);
  });

  it("has a tutorial in step order", () => {
    const indices = getTutorial().map(s => s.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  describe("entries", () => {
    it("have unique ids, and targets unique ids", () => {
      expect(new Set(entries.map(e => e.id)).size).toBe(entries.length);
      const targetIds = entries.flatMap(e => (e.target ? [e.target.id] : []));
      expect(new Set(targetIds).size).toBe(targetIds.length);
    });

    it("sit on a page of their spread", () => {
      for (const entry of entries) {
        const spread = getSpread(entry.spreadId)!;
        expect(entry.page, entry.id).toBeGreaterThanOrEqual(spread.firstPage);
        expect(entry.page, entry.id).toBeLessThanOrEqual(spread.lastPage);
        expect(spread.entries).toContain(entry);
      }
    });

    // Taxonomy (RULES.md #7): a target belongs to exactly one entry (nested, 1:1)
    it("own their target, which points back to entry and spread", () => {
      for (const entry of entries.filter(e => e.target)) {
        const target = getTarget(entry.target!.id)!;
        expect(target.entryId).toBe(entry.id);
        expect(target.spreadId).toBe(entry.spreadId);
        expect(getSpread(entry.spreadId)!.targets).toContain(target);
      }
    });

    it("have resolved entities (refs replaced by the shared entity)", () => {
      for (const target of entries.flatMap(e => (e.target?.entity ? [e.target] : []))) {
        expect(target.entity).toHaveProperty("type");
        expect(target.entity).not.toHaveProperty("ref");
      }
    });

    it("cover every category", () => {
      expect(new Set(entries.map(e => e.category))).toEqual(new Set(["glossary", "videos", "texts", "links"]));
    });
  });

  // RULES.md #14 – single source of truth: one module reads the JSON (and runs the type guard)
  it("is imported only by utils/game-config.ts", () => {
    const importers = listSourceFiles(srcDir)
      .filter(file => /from ['"][^'"]*game\.config\.json['"]|require\([^)]*game\.config\.json/.test(readFileSync(file, "utf8")))
      .map(file => relative(srcDir, file).split("\\").join("/"));
    expect(importers).toEqual(["utils/game-config.ts"]);
  });
});
