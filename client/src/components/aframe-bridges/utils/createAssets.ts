import { sceneService } from "@/services/SceneService";
import { AssetData } from "@/types";
import { Entity } from "aframe";



export const populateAssets = (parentEntity: Entity, assets: AssetData[]): void => {
    assets.forEach(asset => {
        createAsset(parentEntity, asset);
    });
};

export const createAsset = (parentEntity: Entity, asset: AssetData): void => {
    if (!parentEntity) return;
    if (!asset) return;
    const id = asset.id;
    const scene = sceneService.getScene();
    const existingEl = scene?.querySelector(`#${id}`);
    if (existingEl) return

    if (!asset.src) {
      console.error(`Asset "${id}" of type ${asset.assetType} requires src attribute`);
      return;
    }

    let tagName: string;
    console.log(asset.assetType)
    switch (asset.assetType) {
      case 'image':
        tagName = 'img';
        break;
      case 'audio':
        tagName = 'audio';
        break;
      case 'video':
        tagName = 'video';
        break;
      case 'gltf':
      case 'glb':
      default:
        tagName = 'a-asset-item';
    }

    const assetEl = document.createElement(tagName);
    assetEl.id = id;
    assetEl.setAttribute('src', asset.src);
    assetEl.setAttribute('crossorigin', 'anonymous');

    if (tagName === 'a-asset-item') {
      assetEl.setAttribute('response-type', 'arraybuffer');
    }

    parentEntity.appendChild(assetEl);
};