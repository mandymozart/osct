export interface ITutorialManager {
  getCurrentStepId(): string | null;
  next(): boolean;
  previous(): boolean;
  navigateToStep(stepId: string): void;
  isTutorialComplete(): boolean;
  completeTutorial(): void;
}

// Step types - simplified to only INFO
export enum TutorialStepTypes {
  INFO = "info"
}
export type TutorialStepType = TutorialStepTypes.INFO;

/**
 * Base data structure for a step that can be loaded from JSON configuration
 */
export interface TutorialStepData {
  id: string;
  title: string;
  description: string;
  illustration: string;
  next?: string; // Next step ID (empty for last step)
}

/**
 * Interface for tutorial state data in GameStore
 */
export interface TutorialState {
  currentTutorialStepId: string | null;
  tutorialComplete: boolean;
}

/**
 * Interface for tutorial events
 */
export interface TutorialEventMap {
  "step-change": CustomEvent<{ stepId: string }>;
  "tutorial-complete": CustomEvent<void>;
}

/**
 * Array of TutorialStepData representing tutorial configuration
 */
export type TutorialConfiguration = TutorialStepData[];

/**
 * Callback type for step change listeners
 */
export type TutorialStepChangeListener = (stepId: string, state: TutorialState) => void;