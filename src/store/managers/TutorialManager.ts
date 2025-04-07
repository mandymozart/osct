import { 
  TutorialStepData, 
  TutorialState,
  TutorialStepChangeListener,
  TutorialConfiguration,
  TutorialStepTypes,
  IGame,
  ITutorialManager
} from "./../../types";
import { produce } from "immer";
import * as gameConfig from "../../game.config.json";

/**
 * Tutorial Manager for the GameStore
 * Manages tutorial navigation state only
 * Uses Immer for immutable state updates
 */
export class TutorialManager implements ITutorialManager {
  private game: IGame;
  private changeListeners: TutorialStepChangeListener[] = [];
  private tutorialSteps: TutorialStepData[];
  
  /**
   * Initialize the Tutorial Manager with the GameStore
   * @param game The GameStore instance
   */
  constructor(game: IGame) {
    this.game = game;
    this.tutorialSteps = this.convertConfigData(gameConfig.tutorial);
    this.initialize();
  }
  
  /**
   * Convert config data to proper TutorialStepData types
   * @param configData Raw data from config.json
   * @returns Properly typed TutorialConfiguration
   */
  private convertConfigData(configData: any[]): TutorialConfiguration {
    return configData.map(item => ({
      ...item,
      // Ensure all steps are INFO type
      type: TutorialStepTypes.INFO
    }));
  }
  
  /**
   * Initialize the tutorial state
   */
  private initialize(): void {
    // Find the first step (which doesn't have any other step pointing to it)
    const firstStepId = this.findFirstStepId();
    
    // Update the game state using Immer
    this.game.set(
      produce(this.game.state, draft => {
        draft.currentTutorialStepId = firstStepId;
        draft.tutorialComplete = false;
      })
    );
    
    console.log("TutorialManager initialized");
    
    // Notify listeners about initialization
    this.notifyListeners(firstStepId);
  }
  
  /**
   * Add a listener for step changes
   */
  addStepChangeListener(listener: TutorialStepChangeListener): void {
    this.changeListeners.push(listener);
  }
  
  /**
   * Remove a step change listener
   */
  removeStepChangeListener(listener: TutorialStepChangeListener): void {
    this.changeListeners = this.changeListeners.filter(l => l !== listener);
  }
  
  /**
   * Notify listeners of step changes
   */
  private notifyListeners(stepId: string): void {
    const tutorialState = this.getState();
    if (tutorialState) {
      this.changeListeners.forEach(listener => {
        listener(stepId, tutorialState);
      });
    }
  }
  
  /**
   * Get the current tutorial state
   */
  private getState(): TutorialState | null {
    if (!this.game.state) return null;
    
    return {
      currentTutorialStepId: this.game.state.currentTutorialStepId,
      tutorialComplete: this.game.state.tutorialComplete || false
    };
  }
  
  /**
   * Find the first step in the tutorial (entry point)
   * Works by finding a step that no other step has as next
   */
  private findFirstStepId(): string {
    // Make a set of all 'next' refs
    const allNextIds = new Set<string>();
    this.tutorialSteps.forEach(step => {
      if (step.next) {
        allNextIds.add(step.next);
      }
    });
    
    // The first step is one that isn't any other step's 'next'
    const firstStep = this.tutorialSteps.find(step => !allNextIds.has(step.id));
    
    if (!firstStep) {
      console.error("Could not find a first step in the tutorial configuration");
      return this.tutorialSteps[0]?.id || "";
    }
    
    return firstStep.id;
  }

  /**
   * Find a step by ID
   */
  private findStepById(stepId: string): TutorialStepData | undefined {
    return this.tutorialSteps.find(step => step.id === stepId);
  }
  
  /**
   * Get the current step ID
   */
  getCurrentStepId(): string | null {
    return this.game.state?.currentTutorialStepId || null;
  }
  
  /**
   * Navigate to the next step in the tutorial
   * @returns Whether there was a next step to navigate to
   */
  next(): boolean {
    const currentStepId = this.getCurrentStepId();
    if (!currentStepId) return false;
    
    const currentStep = this.findStepById(currentStepId);
    if (!currentStep?.next) {
      // If there's no next step, we've reached the end
      this.completeTutorial();
      return false;
    }
    
    // Move to the next step
    this.navigateToStep(currentStep.next);
    return true;
  }
  
  /**
   * Navigate to the previous step in the tutorial
   * @returns Whether there was a previous step to navigate to
   */
  previous(): boolean {
    const currentStepId = this.getCurrentStepId();
    if (!currentStepId) return false;
    
    // Find the step that points to the current step as its next
    const prevStep = this.tutorialSteps.find(step => step.next === currentStepId);
    if (!prevStep) return false;
    
    // Navigate to the found previous step
    this.navigateToStep(prevStep.id);
    return true;
  }
  
  /**
   * Navigate directly to a specific step by ID
   * @param stepId The ID of the step to navigate to
   */
  navigateToStep(stepId: string): void {
    // Get the step to ensure it exists
    const step = this.findStepById(stepId);
    if (!step) {
      console.error(`Cannot navigate to non-existent step: ${stepId}`);
      return;
    }
    
    // Update the game state
    this.game.set(
      produce(this.game.state, draft => {
        draft.currentTutorialStepId = stepId;
      })
    );
    
    // Notify listeners
    this.notifyListeners(stepId);
  }
  
  /**
   * Mark the entire tutorial as complete
   */
  completeTutorial(): void {
    // Update the game state
    this.game.set(
      produce(this.game.state, draft => {
        draft.tutorialComplete = true;
      })
    );
    
    // Dispatch tutorial complete event
    const event = new CustomEvent('tutorial-complete', {
      bubbles: true,
      composed: true
    });
    
    window.dispatchEvent(event);
  }
  
  /**
   * Check if the entire tutorial is complete
   */
  isTutorialComplete(): boolean {
    return !!this.game.state?.tutorialComplete;
  }
}