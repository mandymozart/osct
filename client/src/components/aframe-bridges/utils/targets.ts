import { getTarget } from "@/utils/config";
import { IGame, TargetData } from "@/types";

/**
 * Maps target IDs to their corresponding numeric indices for the game store
 * @param targetId The string ID of the target (e.g., "target-001")
 * @returns The numeric index extracted from the ID, or -1 if not valid
 */
export const getTargetIndexFromId = (targetId: string): number => {
  // Extract numeric portion from IDs like "target-001" or "target-42"
  const matches = targetId.match(/target-(\d+)/);
  if (matches && matches.length > 1) {
    return parseInt(matches[1], 10);
  }
  return -1; // Invalid ID format
};

/**
 * Sets up event listeners for target entities in the current scene
 * 
 * @param game The game store instance
 * @param sceneElement The a-scene element containing targets
 * @returns A cleanup function to remove the event listeners
 */
export const setupTargetListeners = (
  game: Readonly<IGame>,
  sceneElement: HTMLElement | null
): (() => void) => {
  if (!sceneElement) {
    console.warn("[TargetUtils] No scene element provided to setup target listeners");
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
    
    // Convert string ID to numeric index
    const targetIndex = getTargetIndexFromId(targetId);
    if (targetIndex < 0) {
      console.warn(`[TargetUtils] Could not extract numeric index from target ID: ${targetId}`);
      return;
    }
    
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
          // Get target data from config
          const targetData = getTarget(targetId);
          
          if (targetData) {
            // Add target to game state using numeric index
            game.targets.addTarget(targetIndex);
            
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
          // Remove target from game state using numeric index
          game.targets.removeTarget(targetIndex);
          
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
export const isTargetTracked = (game: Readonly<IGame>, targetId: string): boolean => {
  const targetIndex = getTargetIndexFromId(targetId);
  if (targetIndex < 0) return false;
  
  // Check if the target index is in the tracked targets array
  return game.targets.getTrackedTargets().includes(targetIndex);
};

/**
 * Helper function to get all currently tracked targets
 * 
 * @param game The game store instance
 * @returns Array of tracked target indices
 */
export const getTrackedTargets = (game: Readonly<IGame>): number[] => {
  return game.targets.getTrackedTargets();
};
