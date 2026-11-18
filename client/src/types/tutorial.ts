/** What an onboarding step's button does: the next step, ask for the camera, or open scan mode */
export type StepAction = "next" | "camera" | "scan";

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
  /** Fade-in duration (ms) of the text and footer – the splash; a step without it shows everything at once (#281) */
  fadeIn?: number;
  /** When the text and footer start to fade in (ms) – the icon and the title show at once */
  fadeAfter?: number;
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
