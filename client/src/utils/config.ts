import config from '@/game.config.json';
import { AssetData, ChapterData, TargetData } from '@/types';

const chaptersData: ChapterData[] = config.chapters as ChapterData[]

export const getChapters = (): ChapterData[] => [...chaptersData];

export const getChapter = (id: string): ChapterData | undefined =>
  chaptersData.find((chapter) => chapter.id === id);

export const getInitialChapterId = (): string => config.initialChapterId;

export const getTargets = (id: string): TargetData[] => {
  const chapter = getChapter(id);
  return chapter?.targets ?? [];
};

export const getTarget = (id: string): TargetData | undefined =>
  chaptersData
    .flatMap(chapter => chapter.targets)
    .find((target) => target.id === id);

export const getAsset = (id: string): AssetData | undefined =>
  chaptersData
    .flatMap((chapter) =>
      chapter.targets.flatMap((target) => target.entity?.assets ?? []),
    )
    .find((asset) => asset.id === id);

/**
 * Get all assets or assets for a specific chapter
 * @param chapterId Optional chapter ID to filter assets
 * @returns Array of assets, optionally filtered by chapter
 */
export const getAssets = (chapterId?: string): AssetData[] => {
  if (chapterId) {
    const chapter = getChapter(chapterId);
    if (!chapter) return [];

    return chapter.targets.flatMap((target) => target.entity?.assets ?? []);
  }

  return chaptersData.flatMap((chapter) =>
    chapter.targets.flatMap((target) => target.entity?.assets ?? []),
  );
};
