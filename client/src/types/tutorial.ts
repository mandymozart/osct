import { StepData } from "./game-config";

/**
 * App model of a tutorial step (same shape as `StepData`)
 */
export type Step = StepData;

/**
 * Interface for the TutorialNavigation component
 * Defines the public API that TutorialPage can interact with
 */
export interface ITutorialNavigation extends HTMLElement {
  /**
   * Sets the current step number for the navigation
   * @param value The step number as a string
   */
  setAttribute(name: 'current-step', value: string): void;
  
  /**
   * Gets the current step attribute
   */
  getAttribute(name: 'current-step'): string | null;
}

/**
 * Interface for the TutorialContent component: shows the step with this index (it reads title,
 * text, footer and fade from the step content itself)
 */
export interface ITutorialContent extends HTMLElement {
  /**
   * Sets the current step for the content display
   * @param value The step number as a string
   */
  setAttribute(name: 'current-step', value: string): void;

  /**
   * Gets the current step
   */
  getAttribute(name: 'current-step'): string | null;
}
