import { ChapterData } from "@/types";
import { Scene } from "aframe";

/**
   * Create an A-Frame scene element for the chapter
   * @param {object} chapter - The chapter data
   * @returns {Scene} - The A-Frame scene element Scene extends ANode extends HTMLElement
   */
export const createScene = (chapter: ChapterData): Scene => {
    const scene = document.createElement('a-scene') as Scene;
    
    // Set scene attributes
    scene.setAttribute('id', 'scene');
    scene.setAttribute('mindar-image', 
      `imageTargetSrc: ${chapter.mindSrc}; maxTrack: ${chapter.targets.length}`);
    scene.setAttribute('color-space', 'sRGB');
    scene.setAttribute('renderer', 'colorManagement: true, physicallyCorrectLights');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
    
    // Create assets container
    const assets = document.createElement('a-assets');
    scene.appendChild(assets);
    
    // Create camera
    const camera = document.createElement('a-camera');
    camera.setAttribute('position', '0 0 0');
    camera.setAttribute('look-controls', 'enabled: false');
    scene.appendChild(camera);
    
    return scene;
  }