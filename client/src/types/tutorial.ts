import { StepData } from "./game-config";

/** App model of a tutorial step (same shape as `StepData`) */
export type Step = StepData;

/** Public API of `<tutorial-navigation>` used by TutorialPage */
export interface ITutorialNavigation extends HTMLElement {
  setAttribute(name: 'current-step', value: string): void;
  
  getAttribute(name: 'current-step'): string | null;
}

/** `<tutorial-content>`: renders the step at `current-step` (title, text, footer, fade from the step data) */
export interface ITutorialContent extends HTMLElement {
  setAttribute(name: 'current-step', value: string): void;

  getAttribute(name: 'current-step'): string | null;
}
