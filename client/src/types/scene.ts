import { Scene } from "aframe";

/**
 * Scene service interface
 */
export interface ISceneService {
    /**
     * Get the scene instance
     */
    getScene(): Scene | null;
    
    /**
     * Set the scene instance
     */
    setScene(scene: Scene): void;
}