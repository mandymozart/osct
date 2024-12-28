import trackingTargets from "./data/testingTargets.js";

/**
 * TODO: Modularize the tracking app.
 */
export class TrackingApp {
  constructor() {}
  /**
   * Initialize the tracking app.
   */
  init() {
    // Initialize the tracking app
    console.log("Tracking app initialized");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const sceneEl = document.querySelector("a-scene");

  // Global state management for tracking with individual properties
  const GlobalTrackingState = (() => {
    let currentState = {
      targetsInView: [], // An array to track targets currently in view
    };
    let listeners = [];

    return {
      get: () => currentState,

      // Set individual properties in the state
      set: (newState) => {
        // Merge the existing state with the new state (only overwrite properties that are updated)
        currentState = { ...currentState, ...newState };

        // Notify listeners about the state change
        listeners.forEach((listener) => listener(currentState));
      },

      subscribe: (callback) => {
        listeners.push(callback);
      },

      // Helper method to add a target to the state
      addTarget: (targetId) => {
        if (!currentState.targetsInView.includes(targetId)) {
          currentState.targetsInView.push(targetId);
          this.set({ targetsInView: currentState.targetsInView });
        }
      },

      // Helper method to remove a target from the state
      removeTarget: (targetId) => {
        currentState.targetsInView = currentState.targetsInView.filter(
          (id) => id !== targetId
        );
        this.set({ targetsInView: currentState.targetsInView });
      },
    };
  })();

  sceneEl.addEventListener("loaded", function () {
    const arSystem = sceneEl.systems["mindar-image-system"];

    // Event listeners for MindAR targets
    sceneEl.addEventListener("arReady", () => console.log("MindAR ready"));
    sceneEl.addEventListener("arError", () => console.error("MindAR error"));

    // Handle each target
    for (let i = 1; i <= 5; i++) {
      const targetEl = document.querySelector(`#target-${i}`);
      if (!targetEl) continue;

      targetEl.addEventListener("targetFound", (event) => {
        alert("Target Found");
        GlobalTrackingState.addTarget(i); // Add the target to the state
        const targetInfo = trackingTargets[i];
        console.log("Target Found:", targetInfo);
      });

      targetEl.addEventListener("targetLost", () => {
        GlobalTrackingState.removeTarget(i); // Remove the target from the state
      });
    }
  });

  // Subscribe to state changes
  GlobalTrackingState.subscribe((newState) => {
    console.log("State changed:", newState);
  });

  // Control buttons for testing
  document.querySelector("#start-button").addEventListener("click", () => {
    sceneEl.systems["mindar-image-system"].start();
  });

  document.querySelector("#stop-button").addEventListener("click", () => {
    sceneEl.systems["mindar-image-system"].stop();
  });
  document.GlobalTrackingState = GlobalTrackingState;
});
