import type { StepAction } from "./game-config";

/**
 * One onboarding step – the reader's own UI (`utils/onboarding.ts`), not book content. Without `button` the step
 * advances by itself after `advance` ms (or on a tap). `description` may use `*emphasis*` and blank lines for
 * paragraphs; `{{title}}`, `{{author}}` and `{{publisher}}` are filled from the book.
 */
export interface Step {
  id: string;
  index: number;
  title?: string;
  description?: string;
  /** Small line near the bottom (the splash: the publisher) */
  footer?: string;
  illustration?: string;
  /** Button label; with `action` (default `next`; `camera` asks for the camera first, `scan` opens scan mode) */
  button?: string;
  action?: StepAction;
  /** Fade-in duration of the step's parts (ms; default in the app) */
  fadeIn?: number;
  /** Delay between its parts fading in one after the other (ms); with it Mark fades in too (the splash) */
  stagger?: number;
  /** Auto-advance after ms (steps without button) */
  advance?: number;
}

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
