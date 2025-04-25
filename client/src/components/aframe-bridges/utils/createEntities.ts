import { AssetData, AssetType, TargetData } from "@/types";
import { Entity } from "aframe";

/**
 * Creates a model entity with the provided target data
 * @param target The target data containing entity information
 * @returns An A-Frame entity element configured for a 3D model
 */
export const model = (parentEntity: Entity, asset: AssetData): void => {
    const model = document.createElement('a-gltf-model');
    model.setAttribute('src', `#${asset.id}`);
    model.setAttribute('position', '0 -0.25 0');
    model.setAttribute('rotation', '0 0 0');
    model.setAttribute('scale', '0.05 0.05 0.05');

    model.setAttribute('animation-mixer', '');

    parentEntity.appendChild(model);
};

/**
 * Creates a video entity with the provided target data
 * @param target The target data containing entity information
 * @returns An A-Frame entity element configured for video playback
 */
export const video = (parentEntity: Entity, asset: AssetData): void => {
    const video = document.createElement('a-video');
    if (asset.src) {
        video.setAttribute('src', `#${asset.id}`);
    }

    parentEntity.appendChild(video);
};

export const image = (parentEntity: Entity, asset: AssetData): void => {
    const image = document.createElement('a-image');
    if (asset.src) {
        image.setAttribute('src', `#${asset.id}`);
    }

    parentEntity.appendChild(image);
};

/**
 * Creates a link entity with the provided target data
 * @param target The target data containing entity information
 * @returns An A-Frame entity element configured as a clickable link
 */
export const link = (parentEntity: Entity, asset: AssetData): void => {
    const link = document.createElement('a-entity');

    // Find the link asset
    if (asset.src) {
        // Create a clickable element for the link
        const planeEl = document.createElement('a-plane');
        planeEl.setAttribute('link', `href: ${asset.src}; title: ${asset.id || 'Link'}`);
        planeEl.setAttribute('color', 'blue');
        planeEl.setAttribute('width', '1');
        planeEl.setAttribute('height', '1');
        planeEl.setAttribute('position', '0 0 0');
        link.appendChild(planeEl);
    }

    parentEntity.appendChild(link);
};

/**
 * Creates a target entity with the provided target data
 * @param target The target data containing entity information
 * @returns An A-Frame entity element configured for a tracking target
 */
export const target = (parentEntity: Entity, target: TargetData): void => {
    const entity = document.createElement('a-entity');
    entity.setAttribute('id', target.id);
    entity.setAttribute('mindar-image-target', `targetIndex: ${target.mindarTargetIndex}`);
    attachAssets(entity, target.entity.assets);
    parentEntity.appendChild(entity);
}

/**
 * Creates assets for the target entity
 * @param parentEntity The parent entity to which the assets will be added
 * @param assets An array of asset data
 */
export const attachAssets = (parentEntity: Entity, assets: AssetData[]): void => {
    assets.forEach(asset => {
        switch (asset.assetType) {
            case 'gltf':
            case 'glb':
                return model(parentEntity, asset);
            case 'video':
                return video(parentEntity, asset);
            case 'link':
                return link(parentEntity, asset);
            case 'audio':
            case 'image':
                return image(parentEntity, asset);
            default:
                throw new Error(`Unsupported asset type: ${asset.assetType}`);
        }
    });
}

export const attachEntities = (parentEntity: Entity, entities: TargetData[]): void => {
    entities.forEach(entity => {
        target(parentEntity, entity);
    });
}
