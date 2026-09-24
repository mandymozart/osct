import { getTarget } from "@/utils/game-config";
import { IGame } from "@/types";
import { GameStoreService } from "@/services/GameStoreService";
import { SceneService } from "@/services/SceneService";

/**
 * Sets up event listeners for target entities in the current scene
 * 
 * @returns A cleanup function to remove the event listeners
 */
export const setupTargetListeners = (): (() => void) => {
  const game = GameStoreService.getInstance();
  const sceneService = SceneService.getInstance();
  const sceneElement = sceneService.getScene();
  if (!sceneElement) {
    console.warn("[TargetUtils] No scene element available to setup target listeners");
    return () => {}; // No-op cleanup function
  }

  // Get all target elements in the scene using query selector
  const targetElements = sceneElement.querySelectorAll('[mindar-image-target]');
  
  if (!targetElements || targetElements.length === 0) {
    console.warn("[TargetUtils] No target elements found in scene");
    return () => {};
  }
  
  console.log(`[TargetUtils] Setting up listeners for ${targetElements.length} targets`);
  
  // Store event listener references for cleanup
  const eventListeners: Array<{
    element: Element;
    event: string;
    handler: EventListener;
  }> = [];
  
  // Helper to add and track event listeners
  const addTrackedEventListener = (
    element: Element,
    event: string,
    handler: EventListener
  ) => {
    element.addEventListener(event, handler);
    eventListeners.push({ element, event, handler });
  };
  
  // Set up target event listeners for each target entity
  targetElements.forEach((targetEl) => {
    const targetId = targetEl.id;
    if (!targetId) {
      console.warn("[TargetUtils] Found target element without ID, skipping");
      return;
    }
    
    // The element id is the target id; the MindAR index comes from the game configuration
    const target = getTarget(targetId);
    if (!target) {
      console.warn(`[TargetUtils] Target ${targetId} not found in the game configuration, skipping`);
      return;
    }
    const targetIndex = target.index;
    
    console.log(`[TargetUtils] Setting up listeners for target: ${targetId} (index: ${targetIndex})`);
    
    // Debounce variables to prevent rapid fire events
    let targetFoundTimeout: number | null = null;
    let targetLostTimeout: number | null = null;
    
    // Handler for targetFound event
    const targetFoundHandler = (event: Event) => {
      console.log(`[TargetUtils] Target found: ${targetId} (index: ${targetIndex})`);
      
      // Clear any existing timeout
      if (targetFoundTimeout) window.clearTimeout(targetFoundTimeout);
      
      // Add a small delay to prevent state update collisions
      targetFoundTimeout = window.setTimeout(() => {
        try {
          const targetData = getTarget(targetId);
          
          if (targetData) {
            game.targets.addTarget(targetId);
            
            // Dispatch a custom event that other components can listen for
            const customEvent = new CustomEvent("osct-target-found", {
              detail: { targetId, targetIndex, targetData },
              bubbles: true
            });
            targetEl.dispatchEvent(customEvent);
          } else {
            console.warn(`[TargetUtils] Target ${targetId} not found in configuration`);
          }
        } catch (error) {
          console.error("[TargetUtils] Error handling target found:", error);
        }
      }, 50); // Small delay to avoid collisions
    };
    
    // Handler for targetLost event
    const targetLostHandler = (event: Event) => {
      console.log(`[TargetUtils] Target lost: ${targetId} (index: ${targetIndex})`);
      
      // Clear any existing timeout
      if (targetLostTimeout) window.clearTimeout(targetLostTimeout);
      
      // Add a small delay to prevent state update collisions
      targetLostTimeout = window.setTimeout(() => {
        try {
          game.targets.removeTarget(targetId);
          
          // Dispatch a custom event that other components can listen for
          const customEvent = new CustomEvent("osct-target-lost", {
            detail: { targetId, targetIndex },
            bubbles: true
          });
          targetEl.dispatchEvent(customEvent);
        } catch (error) {
          console.error("[TargetUtils] Error handling target lost:", error);
        }
      }, 50); // Small delay to avoid collisions
    };
    
    // Add event listeners
    addTrackedEventListener(targetEl, "targetFound", targetFoundHandler);
    addTrackedEventListener(targetEl, "targetLost", targetLostHandler);
  });
  
  // Return cleanup function to remove all event listeners
  return () => {
    console.log(`[TargetUtils] Cleaning up ${eventListeners.length} target event listeners`);
    eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
  };
};

/**
 * Helper function to check if a target is being tracked
 * 
 * @param game The game store instance
 * @param targetId The ID of the target to check
 * @returns True if the target is currently tracked, false otherwise
 */
export const isTargetTracked = (game: Readonly<IGame>, targetId: string): boolean =>
  game.targets.getTrackedTargets().includes(targetId);

/**
 * Helper function to get all currently tracked targets
 * 
 * @param game The game store instance
 * @returns Ids of the tracked targets
 */
export const getTrackedTargets = (game: Readonly<IGame>): string[] => {
  return game.targets.getTrackedTargets();
};
