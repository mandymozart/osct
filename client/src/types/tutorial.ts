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
 * Interface for the TutorialContent component
 * Defines the public API for displaying tutorial content
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
  
  /**
   * Sets the title of the tutorial step
   * @param value The title text
   */
  setAttribute(name: 'title', value: string): void;
  
  /**
   * Gets the title
   */
  getAttribute(name: 'title'): string | null;
  
  /**
   * Sets the description of the tutorial step
   * @param value The description text
   */
  setAttribute(name: 'description', value: string): void;
  
  /**
   * Gets the description
   */
  getAttribute(name: 'description'): string | null;
  
  /**
   * Sets the illustration path for the tutorial step
   * @param value The illustration path
   */
  setAttribute(name: 'illustration', value: string): void;
  
  /**
   * Gets the illustration path
   */
  getAttribute(name: 'illustration'): string | null;
}
