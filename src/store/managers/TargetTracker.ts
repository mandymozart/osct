import { produce } from 'immer';
import { Target } from "../types";

/**
 * Manages target tracking during gameplay
 */
export class TargetTracker {
  private store: any; // Reference to the main store
  
  constructor(store: any) {
    this.store = store;
  }
  
  /**
   * Add a target index to the list of tracked targets
   */
  addTarget(targetIndex: number): void {
    const isTargetTracked = this.store.state.trackedTargets.includes(targetIndex);
    
    if (!isTargetTracked) {
      // Use Immer to update tracked targets
      this.store.state = produce(this.store.state, (draft: { trackedTargets: number[]; }) => {
        draft.trackedTargets.push(targetIndex);
      });
      
      // Mark this target as seen if we have a current chapter
      if (this.store.state.currentChapter) {
        this.store.markTargetAsSeen(this.store.state.currentChapter.id, targetIndex);
      }
      
      // Notify listeners of the change
      this.store.notifyListeners();
    }
  }

  /**
   * Remove a target from the list of tracked targets
   */
  removeTarget(targetIndex: number): void {
    // Use Immer to update tracked targets
    this.store.state = produce(this.store.state, (draft: { trackedTargets: number[]; }) => {
      const index = draft.trackedTargets.indexOf(targetIndex);
      if (index !== -1) {
        draft.trackedTargets.splice(index, 1);
      }
    });
    
    // Notify listeners of the change
    this.store.notifyListeners();
  }

  /**
   * Get the list of currently tracked target indices
   */
  getTrackedTargets(): number[] {
    return this.store.state.trackedTargets;
  }

  /**
   * Get targets from current chapter that are currently tracked
   */
  getTrackedTargetObjects(): Target[] {
    if (!this.store.state.currentChapter) return [];
    
    return this.store.state.trackedTargets
      .map((index: number) => this.store.state.currentChapter?.targets.find(
        (t: Target) => t.mindarTargetIndex === index
      ))
      .filter((target: Target | undefined) => target !== undefined) as Target[];
  }
}
