import { ErrorCode } from "@/types";
import { waitForDOMReady } from "@/utils";
import { Scene } from "aframe";

/**
 * Connect to an existing A-Frame scene in the DOM
 * @param selector DOM selector for the scene
 * @param timeoutMs Maximum time to wait for the scene to load
 * @param onError Callback for error handling
 * @returns Promise resolving to the connected scene
 */
export const connectScene = async (
  selector: string,
  timeoutMs = 10000,
  onError?: (code: ErrorCode, msg: string) => void
): Promise<Scene | null> => {
  try {
    await waitForDOMReady();
    
    // Get scene element
    const sceneElement = document.querySelector(selector) as Scene;
    
    if (!sceneElement) {
      const errorMsg = `Scene not found: ${selector}`;
      if (onError) {
        onError(ErrorCode.SCENE_NOT_FOUND, errorMsg);
      }
      throw new Error(errorMsg);
    }

    // Wait for scene to be ready if not already loaded
    if (!sceneElement.hasLoaded) {
      await Promise.race([
        new Promise<void>((resolve) => {
          const handler = () => {
            sceneElement.removeEventListener("loaded", handler);
            resolve();
          };
          sceneElement.addEventListener("loaded", handler);
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            const timeoutError = `Scene loading timed out after ${timeoutMs}ms`;
            if (onError) {
              onError(ErrorCode.TIMEOUT, timeoutError);
            }
            reject(new Error(timeoutError));
          }, timeoutMs);
        })
      ]);
    }

    console.log("[connectScene] A-Frame scene connected");
    return sceneElement;
  } catch (error) {
    console.error("[connectScene] Failed to connect to scene:", error);
    if (onError) {
      onError(
        ErrorCode.SCENE_NOT_FOUND, 
        error instanceof Error ? error.message : "Failed to connect to scene"
      );
    }
    return null;
  }
};