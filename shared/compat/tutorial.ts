/**
 * The onboarding the content carries for apps of content schema 2.24 and before, which require `tutorial` and show it
 * (`GameConfiguration.tutorial`): the reader's own English steps, with the book's `{{title}}`, `{{author}}` and
 * `{{publisher}}` left for those apps to fill. The content build and the editor API's publish write it into every
 * configuration (the PHP API keeps a copy, `Editor::COMPAT_TUTORIAL`, pinned to this one by a test); the reader since
 * 2.25 ignores it. It goes with the next schema MAJOR (#236).
 */
import type { StepData } from "../types/game-config";

export const COMPAT_TUTORIAL: readonly StepData[] = [
  { id: "splash", index: 0, title: "{{title}}", description: "{{author}}", footer: "{{publisher}}", fadeIn: 800, stagger: 500, advance: 3800 },
  {
    id: "intro",
    index: 1,
    description: "This application allows you to reveal videos, texts and key references hidden in the printed publication *{{title}}*.",
    illustration: "/assets/illustrations/tutorial-step-1.svg",
    button: "Continue",
  },
  {
    id: "camera",
    index: 2,
    description: "To scan the book and display interactive content, this application requires access to your camera.\n\nPlease, grant access to proceed.",
    illustration: "/assets/illustrations/tutorial-step-2.svg",
    button: "Grant access",
    action: "camera",
  },
  { id: "done", index: 3, title: "Thank you!", button: "Access scan", action: "scan" },
];
