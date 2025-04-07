import { Scene } from "aframe";

export interface SceneManagerState {
  scene: Scene | null;
}

export interface ISceneManager {
    /**
     * Attach an A-Frame scene to the manager
     */
    attachScene(sceneSelector: Scene | string): Promise<void>;
    
    /**
     * Check if scene is ready for AR/VR operations
     */
    isSceneReady(): boolean;
    
    /**
     * Update scene visibility based on current game mode
     */
    updateSceneVisibility(): Promise<void>;
    
    /**
     * Enter VR mode if available
     */
    enterVR(): Promise<void>;
    
    /**
     * Exit VR mode if active
     */
    exitVR(): Promise<void>;
  }