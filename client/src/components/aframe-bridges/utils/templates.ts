import { AssetData, ChapterData, TargetData } from "@/types";
import { getAssets, getChapter, getTargets } from "@/utils/config";

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
      return `<video id="${asset.id}" src="${asset.src}" preload="auto" loop="true" webkit-playsinline playsinlinecrossorigin="anonymous"></video>`;
    case 'link':
      // Links don't need to be defined in the assets section
      return '';
    default:
      console.warn(`Unknown asset type: ${asset.assetType} for ${asset.id}`);
      return '';
  }
};

/**
 * Creates an entity HTML element string for the A-Frame scene based on target type
 * @param target The target data
 * @returns HTML string representation of the entity
 */
export const createEntityElement = (target: TargetData): string => {
  const entityId = target.id;
  const targetIndex = target.mindarTargetIndex;
  const { entity } = target;
  
  let entityContent = '';
  
  if (!entity || !entity.assets || entity.assets.length === 0) {
    return `
    <a-entity id="${entityId}" bookgame-clickable bookgame-index-target="targetId: ${target.id}" mindar-image-target="targetIndex: ${targetIndex}"><a-sphere color="red" radius="1" position="0 -0.25 0"></a-sphere></a-entity>`;
  }
  
  switch (entity.type) {
    case 'model':
      if (entity.assets && entity.assets.length > 0) {
        const asset = entity.assets[0];
        entityContent = `
    <a-gltf-model rotation="0 0 0" position="0 -0.25 0" scale="0.5 0.5 0.5" src="#${asset.id}" animation-mixer></a-gltf-model>`;
      }
      break;
    
    case 'link':
      if (entity.assets && entity.assets.length > 0) {
        const asset = entity.assets[0];
        entityContent = `
    <a-text value="${target.title}: ${target.description}" 
            color="#FFFFFF" 
            position="0 0 0" 
            rotation="0 0 0" 
            scale="0.5 0.5 0.5"
            id="${target.id}-${asset.id}"></a-text>
    <a-plane color="#000066" opacity="0.5" position="0 0 -0.01" width="2" height="0.5"></a-plane>`;
      }
      break;
    
    case 'video':
      if (entity.assets && entity.assets.length > 0) {
        const asset = entity.assets[0];
        entityContent = `
    <a-video src="#${asset.id}" width="1" height="0.552" position="0 0 0" rotation="0 0 0"></a-video>`;
      }
      break;
    
    case 'basic':
      if (entity.assets && entity.assets.length > 0) {
        const asset = entity.assets[0];
        if (asset.assetType === 'image') {
          entityContent = `
    <a-image src="#${asset.id}" width="1" height="1" position="0 0 0" rotation="0 0 0"></a-image>`;
        }
      }
      break;
      
    default:
      console.warn(`Unknown entity type: ${entity.type} for ${entityId}`);
  }
  
  return `
    <a-entity id="${entityId}" 
    animation="startEvents: click; property: scale;
          from: 2 2 2; to: 1 1 1; dur: 1000"
    bookgame-index-target="targetId: ${target.id}" bookgame-clickable mindar-image-target="targetIndex: ${targetIndex}">${entityContent}
    </a-entity>`;
};

/**
 * Generates an A-Frame scene template string for a chapter
 * @param chapterId The ID of the chapter to generate a template for
 * @returns HTML string representation of the A-Frame scene
 */
export const createTemplateFromConfig = (chapterId: string): string => {
  const chapter = getChapter(chapterId);
  
  if (!chapter) {
    console.error(`Chapter ${chapterId} not found`);
    return '';
  }
  
  // Get all assets for this chapter to avoid duplicates
  const assets = getAssets(chapterId);
  const targets = getTargets(chapterId);
  
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
    mindar-image="imageTargetSrc: ${chapter.mindSrc}; maxTrack: ${targets.length};" 
    color-space="sRGB" 
    renderer="colorManagement: true, physicallyCorrectLights" 
    vr-mode-ui="enabled: false" 
    device-orientation-permission-ui="enabled: false">
    <a-assets>
    ${assetsSection}
    </a-assets>

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
    <a-entity cursor="rayOrigin: mouse" raycaster="objects: .clickable"></a-entity>
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
 * @param chapterId The ID of the chapter to get a template for
 * @param forceRefresh Whether to force a refresh of the cached template
 * @returns HTML string representation of the A-Frame scene 
 */
export const getOrCreateTemplate = (chapterId: string, forceRefresh = false): string => {
  if (!forceRefresh && templateCache.has(chapterId)) {
    return templateCache.get(chapterId)!;
  }
  
  const template = createTemplateFromConfig(chapterId);
  templateCache.set(chapterId, template);
  
  return template;
};

/**
 * Clears the template cache
 */
export const clearTemplateCache = (): void => {
  templateCache.clear();
};

/**
 * Gets all chapter templates
 * @param forceRefresh Whether to force a refresh of the cached templates
 * @returns Record of all chapter templates indexed by chapter ID
 */
export const getAllTemplates = (forceRefresh = false): Record<string, string> => {
  // Import directly to get all chapters
  const allChapters = require('@/game.config.json').chapters as ChapterData[];
  
  return allChapters.reduce((acc, chapter) => {
    acc[chapter.id] = getOrCreateTemplate(chapter.id, forceRefresh);
    return acc;
  }, {} as Record<string, string>);
};
