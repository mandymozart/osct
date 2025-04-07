import * as gameConfig from "../../game.config.json";
import { TutorialStepData } from "@/types";

/**
 * A service class that provides access to tutorial step data
 * This centralizes all the tutorial step data management
 */
export class TutorialStepProvider {
  private static instance: TutorialStepProvider;
  private steps: TutorialStepData[];

  private constructor() {
    this.steps = gameConfig.tutorial;
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): TutorialStepProvider {
    if (!TutorialStepProvider.instance) {
      TutorialStepProvider.instance = new TutorialStepProvider();
    }
    return TutorialStepProvider.instance;
  }

  /**
   * Get all tutorial steps
   */
  public getAllSteps(): TutorialStepData[] {
    return this.steps;
  }

  /**
   * Find a step by ID
   */
  public getStepById(stepId: string): TutorialStepData | undefined {
    return this.steps.find(step => step.id === stepId);
  }

  /**
   * Get the total number of tutorial steps
   */
  public getTotalStepCount(): number {
    return this.steps.filter(step => step.id.startsWith('step-')).length;
  }

  /**
   * Check if a step is the first step (no other step points to it)
   */
  public isFirstStep(stepId: string): boolean {
    return !this.steps.some(step => step.next === stepId);
  }

  /**
   * Check if a step is the last step (has no next step)
   */
  public isLastStep(stepId: string): boolean {
    const step = this.getStepById(stepId);
    return !step?.next;
  }

  /**
   * Get the step number from a step ID (e.g., "step-2" -> 2)
   */
  public getStepNumber(stepId: string): number {
    if (stepId.includes('step-')) {
      return parseInt(stepId.split('-')[1]);
    }
    return 0;
  }
}
