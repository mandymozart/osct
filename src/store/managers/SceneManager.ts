import { Scene } from "aframe";
import { ErrorCode, GameMode, IGame, ISceneManager } from "./../../types";

export class SceneManager implements ISceneManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Attach an A-Frame scene to the store
   * @param sceneSelector Scene instance or DOM selector
   */
  public async attachScene(sceneSelector: Scene | string): Promise<void> {
    try {
      // Get scene element
      const scene =
        typeof sceneSelector === "string"
          ? (document.querySelector(sceneSelector) as Scene)
          : sceneSelector;

      if (!scene) {
        throw new Error(`Scene not found: ${sceneSelector}`);
      }

      // Wait for scene to be ready if not already loaded
      if (!scene.hasLoaded) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            scene.removeEventListener("loaded", handler);
            resolve();
          };
          scene.addEventListener("loaded", handler);
        });
      }

      // Initialize scene
      if (!scene.isPlaying) {
        scene.play();
      }

      // Store scene reference
      this.game.set({ scene });
      console.log("A-Frame scene attached and ready");
    } catch (error) {
      console.error("Failed to attach scene:", error);
      throw error;
    }
  }

  /**
   * Check if scene is ready for AR/VR
   */
  public isSceneReady(): boolean {
    const { scene } = this.game.state;
    return !!(scene && scene.hasLoaded && scene.isPlaying);
  }

  /**
   * Update scene visibility based on current game mode
   */
  public async updateSceneVisibility(): Promise<void> {
    if (!this.game.state.scene) return;

    try {
      switch (this.game.state.mode) {
        case GameMode.DEFAULT:
          this.game.state.scene.setAttribute("visible", "true");
          this.game.state.scene.play();
          await this.exitVR();
          break;

        case GameMode.VR:
          this.game.state.scene.setAttribute("visible", "true");
          this.game.state.scene.play();
          await this.enterVR();
          break;

        case GameMode.QR:
          this.game.state.scene.setAttribute("visible", "false");
          this.game.state.scene.pause();
          await this.exitVR();
          break;
      }
    } catch (error) {
      console.error("Failed to update scene visibility:", error);
      this.game.state.scene.setAttribute("visible", "true");
      this.game.state.scene.play();
      this.game.notifyError({
        code: ErrorCode.FAILED_TO_UPDATE_SCENE,
        msg: "Failed to update scene mode",
      });
      throw error;
    }
  }

  /**
   * Enter VR mode if available
   */
  public async enterVR(): Promise<void> {
    const { scene } = this.game.state;
    if (!scene) {
      throw new Error("No scene attached");
    }

    try {
      if (!scene.is("vr-mode")) {
        await scene.enterVR();
        this.game.set({ mode: GameMode.VR });
      }
    } catch (error) {
      this.game.set({ mode: GameMode.DEFAULT });
      this.game.notifyError({
        code: ErrorCode.FAILED_TO_ENTER_VR,
        msg: "Failed to enter VR mode",
      });
      throw error;
    }
  }

  /**
   * Exit VR mode if active
   */
  public async exitVR(): Promise<void> {
    const { scene } = this.game.state;
    if (!scene) return;

    try {
      if (scene.is("vr-mode")) {
        await scene.exitVR();
        this.game.set({ mode: GameMode.DEFAULT });
      }
    } catch (error) {
      this.game.notifyError({
        code: ErrorCode.FAILED_TO_EXIT_VR,
        msg: "Failed to exit VR mode",
      });
      throw error;
    }
  }

  /**
   * Clean up scene resources
   */
  cleanup(): void {
    const { scene } = this.game.state;
    if (scene) {
      scene.pause();
      this.game.set({ scene: null });
    }
  }
}
