import { Scene } from "aframe";
import { ChapterResource } from "../chapters";
import { Target } from "../";

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
    
    /**
     * Detach the scene from the store
     */
    detachScene(): void;
    
    /**
     * Update scene with chapter resources
     * @param chapter The chapter resource to render in the scene
     */
    updateSceneWithChapter(chapter: ChapterResource): void;

    /**
     * Clear all dynamic scene elements
     * Removes assets, targets, and the MindAR target file
     */
    clearScene(): void;

    /**
     * Add a target to the scene
     * @param target The target to add to the scene
     * @param index The index of the target in the chapter
     */
    addTargetToScene(target: Target, index: number): void;
  }