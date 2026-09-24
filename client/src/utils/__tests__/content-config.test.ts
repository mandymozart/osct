import { decode } from "@msgpack/msgpack";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import config from "@/game.config.json";
import { getAssets, getSpread, getSpreads } from "@/utils/config";

/**
 * Guards the built content (`game.config.json`) written by the content build.
 * Runs against the real data, so broken content fails here before it fails in the browser.
 */

// RULES.md #3 – replace with the shared constant once Phase 0 introduces it.
const MAX_TARGETS_PER_GROUP = 5;

const publicDir = resolve(__dirname, "../../../public");
const publicFile = (src: string) => resolve(publicDir, src.replace(/^\//, ""));

type MindFile = { dataList: { targetImage: { width: number; height: number } }[] };

describe("content config", () => {
  const spreads = getSpreads();

  it("has an existing initial spread", () => {
    expect(getSpread(config.initialSpreadId)).toBeDefined();
  });

  it("has unique spread and target ids", () => {
    const spreadIds = spreads.map(c => c.id);
    const targetIds = spreads.flatMap(c => c.targets.map(t => t.id));
    expect(new Set(spreadIds).size).toBe(spreadIds.length);
    expect(new Set(targetIds).size).toBe(targetIds.length);
  });

  it.each(spreads.map(c => [c.id, c] as const))(
    "%s stays within the target limit and indexes its targets 0..n-1",
    (_id, spread) => {
      expect(spread.targets.length).toBeLessThanOrEqual(MAX_TARGETS_PER_GROUP);
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
    ].filter(Boolean) as string[];

    const missing = files.filter(src => !existsSync(publicFile(src)));
    expect(missing).toEqual([]);
  });
});
