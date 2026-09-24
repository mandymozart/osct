import { existsSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import config from "@/game.config.json";
import { getAssets, getChapter, getChapters } from "@/utils/config";

/**
 * Guards the built content (`game.config.json`) written by the content build.
 * Runs against the real data, so broken content fails here before it fails in the browser.
 */

// RULES.md #3 – replace with the shared constant once Phase 0 introduces it.
const MAX_TARGETS_PER_GROUP = 5;

const publicDir = resolve(__dirname, "../../../public");
const publicFile = (src: string) => resolve(publicDir, src.replace(/^\//, ""));

describe("content config", () => {
  const chapters = getChapters();

  it("has an existing initial chapter", () => {
    expect(getChapter(config.initialChapterId)).toBeDefined();
  });

  it("has unique chapter and target ids", () => {
    const chapterIds = chapters.map(c => c.id);
    const targetIds = chapters.flatMap(c => c.targets.map(t => t.id));
    expect(new Set(chapterIds).size).toBe(chapterIds.length);
    expect(new Set(targetIds).size).toBe(targetIds.length);
  });

  it.each(chapters.map(c => [c.id, c] as const))(
    "%s stays within the target limit and indexes its targets 0..n-1",
    (_id, chapter) => {
      expect(chapter.targets.length).toBeLessThanOrEqual(MAX_TARGETS_PER_GROUP);
      expect(chapter.targets.map(t => t.mindarTargetIndex)).toEqual(chapter.targets.map((_, i) => i));
    },
  );

  it("references files that exist in public/", () => {
    const files = [
      ...chapters.map(c => c.mindSrc),
      ...chapters.flatMap(c => c.targets.map(t => t.imageTargetSrc)),
      ...getAssets().map(a => a.src),
    ].filter(Boolean) as string[];

    const missing = files.filter(src => !existsSync(publicFile(src)));
    expect(missing).toEqual([]);
  });
});
