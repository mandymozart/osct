import { Scene } from 'aframe';
import { GameMode, GameStore } from "../types";

export class SceneManager {
  private store: GameStore;
  
  constructor(store: GameStore) {
    this.store = store;
  }

  /**
   * Attach an A-Frame scene to the store
   * @param sceneSelector Scene instance or DOM selector
   */
  async attachScene(sceneSelector: Scene | string): Promise<void> {
    try {
      // Get scene element
      const scene = typeof sceneSelector === 'string' 
        ? document.querySelector(sceneSelector) as Scene
        : sceneSelector;

      if (!scene) {
        throw new Error(`Scene not found: ${sceneSelector}`);
      }

      // Wait for scene to be ready if not already loaded
      if (!scene.hasLoaded) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            scene.removeEventListener('loaded', handler);
            resolve();
          };
          scene.addEventListener('loaded', handler);
        });
      }

      // Initialize scene
      if (!scene.isPlaying) {
        scene.play();
      }

      // Store scene reference
      this.store.set({ scene });
      console.log('A-Frame scene attached and ready');

    } catch (error) {
      console.error('Failed to attach scene:', error);
      throw error;
    }
  }

  /**
   * Get the current A-Frame scene
   */
  getScene(): Scene | null {
    return this.store.state.scene;
  }

  /**
   * Check if scene is ready for AR/VR
   */
  isSceneReady(): boolean {
    const scene = this.getScene();
    return !!(scene && scene.hasLoaded && scene.isPlaying);
  }

  public updateSceneVisibility(): void {
    const scene = this.getScene();
    if (!scene) return;

    switch (this.store.state.mode) {
      case GameMode.DEFAULT:
        scene.setAttribute("visible", "true");
        scene.play();
        // Ensure we're not in VR
        if (scene.is('vr-mode')) {
          scene.exitVR();
        }
        break;
      case GameMode.VR:
        scene.setAttribute("visible", "true");
        scene.play();
        // Enter VR if not already
        if (!scene.is('vr-mode')) {
          scene.enterVR();
        }
        break;
      case GameMode.QR:
        scene.setAttribute("visible", "false");
        scene.pause();
        // Always exit VR in QR mode
        if (scene.is('vr-mode')) {
          scene.exitVR();
        }
        break;
    }
  }

  /**
   * Enter VR mode if available
   */
  async enterVR(): Promise<void> {
    const scene = this.getScene();
    if (!scene) {
      throw new Error('No scene attached');
    }

    try {
      if (!scene.is('vr-mode')) {
        await scene.enterVR();
        this.store.set({ mode: GameMode.VR });
      }
    } catch (error) {
      console.error('Failed to enter VR mode:', error);
      // Fallback to default mode
      this.store.set({ mode: GameMode.DEFAULT });
      throw error;
    }
  }

  /**
   * Exit VR mode
   */
  async exitVR(): Promise<void> {
    const scene = this.getScene();
    if (!scene) return;

    try {
      if (scene.is('vr-mode')) {
        await scene.exitVR();
      }
      this.store.set({ mode: GameMode.DEFAULT });
    } catch (error) {
      console.error('Failed to exit VR mode:', error);
      throw error;
    }
  }

  /**
   * Clean up scene resources
   */
  cleanup(): void {
    const scene = this.getScene();
    if (scene) {
      scene.pause();
      this.store.set({ scene: null });
    }
  }
}