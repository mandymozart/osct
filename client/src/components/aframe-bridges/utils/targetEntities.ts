import { AssetType, TargetData } from "@/types";

/**
 * Creates a model entity with the provided target data
 * @param target The target data containing entity information
 * @returns An A-Frame entity element configured for a 3D model
 */
export const model = (target: TargetData): HTMLElement => {
    const entity = document.createElement('a-entity');
    entity.setAttribute('id', target.id);
    entity.setAttribute('mindar-image-target', `targetIndex: ${target.mindarTargetIndex}`);
    
    // Find the model asset
    const modelAsset = target.entity.assets.find(asset => asset.assetType === 'model');
    if (modelAsset && modelAsset.src) {
        entity.setAttribute('gltf-model', modelAsset.src);
    }
    return entity;
};

/**
 * Creates a video entity with the provided target data
 * @param target The target data containing entity information
 * @returns An A-Frame entity element configured for video playback
 */
export const video = (target: TargetData): HTMLElement => {
    const entity = document.createElement('a-entity');
    entity.setAttribute('id', target.id);
    entity.setAttribute('mindar-image-target', `targetIndex: ${target.mindarTargetIndex}`);
    
    // Find the video asset
    const videoAsset = target.entity.assets.find(asset => asset.assetType === 'video');
    if (videoAsset && videoAsset.src) {
        entity.setAttribute('video-texture', videoAsset.src);
    }
    return entity;
};

/**
 * Creates a link entity with the provided target data
 * @param target The target data containing entity information
 * @returns An A-Frame entity element configured as a clickable link
 */
export const link = (target: TargetData): HTMLElement => {
    const entity = document.createElement('a-entity');
    entity.setAttribute('id', target.id);
    entity.setAttribute('mindar-image-target', `targetIndex: ${target.mindarTargetIndex}`);
    
    // Find the link asset
    const linkAsset = target.entity.assets.find(asset => asset.assetType === 'link');
    if (linkAsset && linkAsset.src) {
        // Create a clickable element for the link
        const linkEl = document.createElement('a-plane');
        linkEl.setAttribute('link', `href: ${linkAsset.src}; title: ${linkAsset.id || 'Link'}`);
        linkEl.setAttribute('color', 'blue');
        linkEl.setAttribute('width', '1');
        linkEl.setAttribute('height', '1');
        linkEl.setAttribute('position', '0 0 0');
        entity.appendChild(linkEl);
    }
    entity.getDOMAttribute('id');
    entity.getDOMAttribute('mindar-image-target');
    console.log(entity)
    return entity;
};

/**
 * Central function to create the appropriate entity based on the target's entity type
 * @param target The target data containing entity information
 * @returns An A-Frame entity element configured based on the entity type
 */
// export const createEntity = (target: TargetData): HTMLElement => {
//     switch(target.entity.type) {
//         case 'model':
//             return model(target);
//         case 'video':
//             return video(target);
//         case 'link':
//             return link(target);
//         default:
//             throw new Error(`Unsupported entity type: ${target.entity.type}`);
//     }
// }