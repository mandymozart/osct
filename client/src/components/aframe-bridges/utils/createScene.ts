import { getAssets, getMaxTargetsPerSpread, getSpread, getTargets } from "@/utils/content";
import { Scene } from "aframe";
import { attachAssets, attachEntities } from "./createEntities";
import { AssetData, TargetData } from "@/types";

/**
   * Create an A-Frame scene element for the spread
   * @param {string} id - The spread id
   * @returns {Scene} - The A-Frame scene element Scene extends ANode extends HTMLElement
   */
export const createScene = (id: string): Scene => {
    const spreadData = getSpread(id);
    const allAssetsData: AssetData[] = getAssets(id);
    const entitiesData: TargetData[] = getTargets(id);
    if(!spreadData) {
      throw new Error(`Spread ${id} not found`);
    }
    const scene = document.createElement('a-scene') as Scene;
    
    // Set scene attributes
    scene.setAttribute('id', 'scene');
    scene.setAttribute('mindar-image', 
      `imageTargetSrc: ${spreadData.mindSrc}; maxTrack: ${getMaxTargetsPerSpread()}`);
    scene.setAttribute('color-space', 'sRGB');
    scene.setAttribute('renderer', 'colorManagement: true, physicallyCorrectLights');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
    
    // Create assets container
    const assets = document.createElement('a-assets');
    scene.appendChild(assets);
    attachAssets(assets, allAssetsData);

    // Create entities
    attachEntities(scene, entitiesData);
    
    // Create camera
    const camera = document.createElement('a-camera');
    camera.setAttribute('position', '0 0 0');
    camera.setAttribute('look-controls', 'enabled: false');
    scene.appendChild(camera);
    
    return scene;
  }