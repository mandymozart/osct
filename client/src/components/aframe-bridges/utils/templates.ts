import { AssetData, Target } from "@/types";
import { getAssets, getEntry, getMaxTargetsPerSpread, getSpread, getSpreads, getTargets } from "@/utils/game-config";

const attr = (value: string): string => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * Creates an asset HTML element string for the A-Frame scene
 * @param asset The asset data
 * @returns HTML string representation of the asset
 */
export const createAssetElement = (asset: AssetData): string => {
  switch (asset.assetType) {
    case 'glb':
    case 'gltf':
      return `<a-asset-item id="${asset.id}" src="${asset.src}"></a-asset-item>`;
    case 'image':
      return `<img id="${asset.id}" src="${asset.src}">`;
    case 'video':
      return `<video id="${asset.id}" src="${asset.src}" preload="auto" loop="true" webkit-playsinline playsinline crossorigin="anonymous"></video>`;
    case 'audio':
      return `<audio id="${asset.id}" src="${asset.src}" preload="auto" crossorigin="anonymous"></audio>`;
    default:
      console.warn(`Unknown asset type: ${asset.assetType} for ${asset.id}`);
      return '';
  }
};

/**
 * Creates an entity HTML element string for the A-Frame scene based on the entity type
 * @param target The target (entity refs already resolved)
 * @returns HTML string representation of the entity
 */
export const createEntityElement = (target: Target): string => {
  const { entity } = target;
  const asset = entity?.assets[0];

  let entityContent = '';

  switch (entity?.type) {
    case undefined:
      // Target without AR entity (found indicator is app UI, Phase 3)
      break;

    case 'model':
      if (asset) {
        entityContent = `
    <a-gltf-model rotation="0 0 0" position="0 -0.25 0" scale="0.5 0.5 0.5" src="#${asset.id}" animation-mixer></a-gltf-model>`;
      }
      break;

    case 'link': {
      // Shows the entry; the URL itself is the entry's `media`
      const entry = getEntry(target.entryId);
      entityContent = `
    <a-text value="${attr(`${entry?.title ?? ''}: ${entry?.body ?? ''}`)}" 
            color="#FFFFFF" 
            position="0 0 0" 
            rotation="0 0 0" 
            scale="0.5 0.5 0.5"
            id="${target.id}-link"></a-text>
    <a-plane color="#000066" opacity="0.5" position="0 0 -0.01" width="2" height="0.5"></a-plane>`;
      break;
    }

    case 'video':
      if (asset) {
        entityContent = `
    <a-video src="#${asset.id}" width="1" height="0.552" position="0 0 0" rotation="0 0 0"></a-video>`;
      }
      break;

    case 'image':
      if (asset) {
        entityContent = `
    <a-image src="#${asset.id}" width="1" height="1" position="0 0 0" rotation="0 0 0"></a-image>`;
      }
      break;

    default:
      console.warn(`Unknown entity type: ${entity?.type} for ${target.id}`);
  }

  return `
    <a-entity id="${target.id}" mindar-image-target="targetIndex: ${target.index}">${entityContent}
    </a-entity>`;
};

/**
 * Generates an A-Frame scene template string for a spread
 * @param spreadId The ID of the spread to generate a template for
 * @returns HTML string representation of the A-Frame scene
 */
export const createTemplateFromConfig = (spreadId: string): string => {
  const spread = getSpread(spreadId);
  
  if (!spread) {
    console.error(`Spread ${spreadId} not found`);
    return '';
  }
  
  // Get all assets for this spread to avoid duplicates
  const assets = getAssets(spreadId);
  const targets = getTargets(spreadId);
  
  // Create a map to deduplicate assets
  const assetMap = new Map<string, AssetData>();
  assets.forEach(asset => {
    assetMap.set(asset.id, asset);
  });
  
  // Generate assets section
  const assetsSection = Array.from(assetMap.values())
    .map(asset => createAssetElement(asset))
    .filter(Boolean) // Remove empty strings
    .join('\n    ');
  
  // Generate entities section
  const entitiesSection = targets
    .map(target => createEntityElement(target))
    .join('');
  
  // Construct the full template
  return /* html */`
<a-scene 
    id="scene" 
    mindar-image="imageTargetSrc: ${spread.mindSrc}; maxTrack: ${getMaxTargetsPerSpread()};" 
    color-space="sRGB" 
    renderer="colorManagement: true, physicallyCorrectLights" 
    vr-mode-ui="enabled: false" 
    device-orientation-permission-ui="enabled: false">
    <a-assets>
    ${assetsSection}
    </a-assets>

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
${entitiesSection}
</a-scene>
`;
};

/**
 * Caches generated templates to avoid redundant processing
 */
const templateCache = new Map<string, string>();

/**
 * Gets a cached template or generates a new one
 * @param spreadId The ID of the spread to get a template for
 * @param forceRefresh Whether to force a refresh of the cached template
 * @returns HTML string representation of the A-Frame scene 
 */
export const getOrCreateTemplate = (spreadId: string, forceRefresh = false): string => {
  if (!forceRefresh && templateCache.has(spreadId)) {
    return templateCache.get(spreadId)!;
  }
  
  const template = createTemplateFromConfig(spreadId);
  templateCache.set(spreadId, template);
  
  return template;
};

/**
 * Clears the template cache
 */
export const clearTemplateCache = (): void => {
  templateCache.clear();
};

/**
 * Gets all spread templates
 * @param forceRefresh Whether to force a refresh of the cached templates
 * @returns Record of all spread templates indexed by spread ID
 */
export const getAllTemplates = (forceRefresh = false): Record<string, string> => {
  return getSpreads().reduce((acc, spread) => {
    acc[spread.id] = getOrCreateTemplate(spread.id, forceRefresh);
    return acc;
  }, {} as Record<string, string>);
};
