import config from '@/game.config.json';
import { AssetData, SpreadData, TargetData } from '@/types';

const spreadsData: SpreadData[] = config.spreads as SpreadData[]

export const getSpreads = (): SpreadData[] => [...spreadsData];

export const getSpread = (id: string): SpreadData | undefined =>
  spreadsData.find((spread) => spread.id === id);

export const getInitialSpreadId = (): string => config.initialSpreadId;

export const getTargets = (id: string): TargetData[] => {
  const spread = getSpread(id);
  return spread?.targets ?? [];
};

export const getTarget = (id: string): TargetData | undefined =>
  spreadsData
    .flatMap(spread => spread.targets)
    .find((target) => target.id === id);

export const getAsset = (id: string): AssetData | undefined =>
  spreadsData
    .flatMap((spread) =>
      spread.targets.flatMap((target) => target.entity?.assets ?? []),
    )
    .find((asset) => asset.id === id);

/**
 * Get all assets or assets for a specific spread
 * @param spreadId Optional spread ID to filter assets
 * @returns Array of assets, optionally filtered by spread
 */
export const getAssets = (spreadId?: string): AssetData[] => {
  if (spreadId) {
    const spread = getSpread(spreadId);
    if (!spread) return [];

    return spread.targets.flatMap((target) => target.entity?.assets ?? []);
  }

  return spreadsData.flatMap((spread) =>
    spread.targets.flatMap((target) => target.entity?.assets ?? []),
  );
};
