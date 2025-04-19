import { Scene } from "aframe";
import {
  ErrorCode,
  GameMode,
  IGame,
  ISceneManager,
  ChapterResource,
  Target,
  LoadingState,
} from "./../../types";
import { waitForDOMReady } from "@/utils";

export class SceneManager implements ISceneManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Attach an A-Frame scene to the store
   * @param sceneSelector Scene instance or DOM selector
   * @param timeoutMs Optional timeout in milliseconds (default: 10000)
   */
  public async attachScene(sceneSelector: Scene | string, timeoutMs: number = 10000): Promise<void> {
    try {
      await waitForDOMReady();
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
        await Promise.race([
          new Promise<void>((resolve) => {
            const handler = () => {
              scene.removeEventListener("loaded", handler);
              resolve();
            };
            scene.addEventListener("loaded", handler);
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Scene loading timed out after " + timeoutMs + "ms"));
            }, timeoutMs);
          })
        ]);
      }

      // Initialize scene
      if (!scene.isPlaying) {
        // scene.play();
        console.log("[Scene Manager] Skip playing scene");
      }

      // Store scene reference
      this.game.set({ scene });
      console.log("[Scene Manager] A-Frame scene attached and ready");
    } catch (error) {
      console.error("[Scene Manager] Failed to attach scene:", error);
      this.game.notifyError({
        code: ErrorCode.SCENE_NOT_FOUND,
        msg: error instanceof Error ? error.message : "Failed to attach scene"
      });
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
    return new Promise<void>(async (resolve) => {
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
      resolve();
    });
  }

  /**
   * Enter VR mode if available
   */
  public async enterVR(): Promise<void> {
    return new Promise<void>(async (resolve) => {
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
      resolve();
    });
  }

  /**
   * Exit VR mode if active
   */
  public async exitVR(): Promise<void> {
    const { scene } = this.game.state;
    if (!scene) return;

    try {
      if (scene.is("vr-mode")) {
        // TODO: move to scene-bridge for clear separation of 
        // state and view concerns
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
   * Detach the scene from the store
   */
  public detachScene(): void {
    if (this.game.state.scene) {
      this.clearSceneAssets(this.game.state.scene);
      this.clearSceneTargets(this.game.state.scene);
      this.game.set({ scene: null });
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

  /**
   * Update scene with chapter resources
   * Handles the A-Frame DOM updates based on chapter data
   */
  public updateSceneWithChapter(chapter: ChapterResource): void {
    if (!this.isSceneReady() || !chapter) {
      console.warn(
        "Scene not ready or chapter not provided for updateSceneWithChapter"
      );
      return;
    }

    const scene = this.game.state.scene;
    if (!scene) return;
    this.clearScene();
    this.addChapterAssetsToScene(scene, chapter);
    this.addChapterTargetsToScene(scene, chapter);
  }

  /**
   * Clear all dynamically added assets from the scene
   */
  private clearSceneAssets(scene: Scene): void {
    const assetEl = scene.querySelector("a-assets");
    if (!assetEl) return;

    // Keep only built-in assets (those without the 'dynamic-asset' class)
    const dynamicAssets = assetEl.querySelectorAll(".dynamic-asset");
    dynamicAssets.forEach((asset) => asset.remove());
  }

  /**
   * Clear all dynamically added target entities from the scene
   */
  private clearSceneTargets(scene: Scene): void {
    // Remove entities with the 'dynamic-target' class
    // TODO: Check if aframe types are respected. because injecting components is done differently.
    const dynamicTargets = scene.querySelectorAll(".dynamic-target");
    dynamicTargets.forEach((target) => target.remove());
  }

  /**
   * Clear the MindAR target file to allow changing targets
   */
  private clearMindARTarget(scene: Scene): void {
    // Find and remove the mindar-image-system component
    const mindARSystem = scene.querySelector("[mindar-image-system]");
    if (mindARSystem) {
      // Remove the attribute to reset the AR tracking
      mindARSystem.removeAttribute("mindar-image-system");
    }
  }

  /**
   * Clear all dynamic scene elements
   * This method should be called before updating the scene with new chapter content
   */
  public clearScene(): void {
    const { scene } = this.game.state;
    if (!scene) {
      console.warn("Cannot clear scene: no scene is attached");
      return;
    }

    // Remove assets, targets, and MindAR target file
    this.clearSceneAssets(scene);
    this.clearSceneTargets(scene);
    this.clearMindARTarget(scene);
  }

  /**
   * Add chapter assets to the scene
   */
  private addChapterAssetsToScene(
    scene: Scene,
    chapter: ChapterResource
  ): void {
    const assetEl = scene.querySelector("a-assets");
    if (!assetEl) return;

    // Collect all assets from the chapter
    const assetsToAdd: Array<{ id: string; src: string }> = [];

    // Based on the code structure, each target has a single entity which has multiple assets
    chapter.targets.forEach((target) => {
      if (
        target.status !== LoadingState.LOADED ||
        !target.entity ||
        target.entity.status !== LoadingState.LOADED
      )
        return;

      // Add assets from this entity
      if (target.entity.assets && Array.isArray(target.entity.assets)) {
        target.entity.assets.forEach((asset) => {
          if (asset.status === LoadingState.LOADED && asset.id && asset.src) {
            assetsToAdd.push({
              id: asset.id,
              src: asset.src,
            });
          }
        });
      }
    });

    // Now add assets to the scene
    assetsToAdd.forEach((asset) => {
      // Create asset elements
      const assetItem = document.createElement("a-asset-item");
      assetItem.id = asset.id;
      assetItem.setAttribute("src", asset.src);
      assetItem.classList.add("dynamic-asset"); // Mark as dynamically added
      assetEl.appendChild(assetItem);
    });
  }

  /**
   * Add chapter target entities to the scene
   */
  private addChapterTargetsToScene(
    scene: Scene,
    chapter: ChapterResource
  ): void {
    if (!chapter.targets || chapter.targets.length === 0) {
      console.warn("No targets found in chapter");
      return;
    }

    // Add each target entity
    chapter.targets.forEach((target, index) => {
      if (
        target.status !== LoadingState.LOADED ||
        !target.entity ||
        target.entity.status !== LoadingState.LOADED
      ) {
        console.warn(
          `Target or its entity not fully loaded, skipping index ${index}`
        );
        return;
      }

      // Create target entity
      const targetEntity = document.createElement("a-entity");
      targetEntity.setAttribute("id", `target-${index}`);
      targetEntity.classList.add("dynamic-target"); // Mark as dynamically added
      targetEntity.setAttribute("mindar-image-target", `targetIndex: ${index}`);

      // Create entity based on target.entity configuration
      const entity = target.entity;

      // Create the specific element based on entity type
      const entityElement = this.createEntityElement(entity);
      if (entityElement) {
        targetEntity.appendChild(entityElement);
      }

      // Add target to scene
      scene.appendChild(targetEntity);
    });
  }

  /**
   * Add a single target to the scene
   * @param target The target to add to the scene
   * @param index The index of the target in the chapter
   */
  public addTargetToScene(target: Target, index: number): void {
    const { scene } = this.game.state;
    if (!scene || !this.isSceneReady()) {
      console.warn("Cannot add target to scene: scene not ready");
      return;
    }

    if (!target || target.status !== LoadingState.LOADED) {
      console.warn(`Cannot add target to scene: target ${index} not loaded`);
      return;
    }

    // Create target entity
    const targetEntity = document.createElement("a-entity");
    targetEntity.setAttribute("id", `target-${index}`);
    targetEntity.classList.add("dynamic-target"); // Mark as dynamically added
    targetEntity.setAttribute("mindar-image-target", `targetIndex: ${index}`);

    // Create entity based on target.entity configuration
    if (target.entity && target.entity.status === LoadingState.LOADED) {
      // Create the specific element based on entity type
      const entityElement = this.createEntityElement(target.entity);
      if (entityElement) {
        targetEntity.appendChild(entityElement);
      }
    }
    scene.appendChild(targetEntity);
  }

  /**
   * Create appropriate entity element based on entity type
   */
  private createEntityElement(entity: {
    type?: string;
    [key: string]: any;
  }): HTMLElement | null {
    let element: HTMLElement | null = null;

    // Create element based on type (model, video, image, etc.)
    switch (entity.type) {
      case "model":
        element = document.createElement("a-gltf-model");
        element.setAttribute(
          "src",
          `#${entity.assetId || entity.assets?.[0]?.id}`
        );
        if (entity.animation) {
          element.setAttribute("animation-mixer", "");
        }
        break;

      case "video":
        element = document.createElement("a-video");
        element.setAttribute(
          "src",
          `#${entity.assetId || entity.assets?.[0]?.id}`
        );
        break;

      case "image":
        element = document.createElement("a-image");
        element.setAttribute(
          "src",
          `#${entity.assetId || entity.assets?.[0]?.id}`
        );
        break;

      default:
        // Default to model if type not specified
        element = document.createElement("a-gltf-model");
        element.setAttribute(
          "src",
          `#${entity.assetId || entity.assets?.[0]?.id}`
        );
        break;
    }

    // Set common properties
    if (entity.position) {
      element.setAttribute("position", entity.position);
    } else {
      element.setAttribute("position", "0 -0.25 0");
    }

    if (entity.rotation) {
      element.setAttribute("rotation", entity.rotation);
    } else {
      element.setAttribute("rotation", "0 0 0");
    }

    if (entity.scale) {
      element.setAttribute("scale", entity.scale);
    } else {
      element.setAttribute("scale", "0.05 0.05 0.05");
    }

    return element;
  }
}
