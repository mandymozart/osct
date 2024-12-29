import trackingTargets from "../targets/testingTargets.js";

class GameStore {
  constructor() {
    this.currentState = {
      scene: null,
      trackedTargets: [],
    };
    this.listeners = [];
    this.initialize();
  }

  initialize() {
    console.log("GameStore initialized");
  }

  set(newState) {
    this.currentState = { ...this.currentState, ...newState };
    this.notifyListeners();
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  unsubscribe(callback) {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }

  getScene() {
    return this.currentState.scene;
  }

  setScene(scene) {
    this.currentState.scene = scene;
    this.notifyListeners();
  }

  addTarget(targetId) {
    const target = trackingTargets[targetId];
    console.log("target", target, targetId);
    const isTargetTracked = this.currentState.trackedTargets.includes(targetId);

    if (target && !isTargetTracked) {
      this.currentState.trackedTargets.push(targetId);
      this.set({ trackedTargets: this.currentState.trackedTargets });
    } else {
      console.warn(
        `Target ${targetId} not found in trackingTargets or already tracked`
      );
    }
  }

  removeTarget(targetId) {
    this.currentState.trackedTargets = this.currentState.trackedTargets.filter(
      (id) => id !== targetId
    );
    this.set({ trackedTargets: this.currentState.trackedTargets });
  }

  getTargets() {
    return this.currentState.trackedTargets;
  }

  notifyListeners() {
    // Notify all listeners about the state change
    this.listeners.forEach((listener) => listener(this.currentState));
  }
}

export const gameStore = new GameStore();
