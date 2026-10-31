import { t } from "i18next";
import type { BookData, Step } from "@/types";
import { SPLASH_STEP } from "./static-splash-html";

/**
 * The onboarding – the reader's own UI, the same for every book (#236): the splash (the book's title, author and
 * publisher), what the app does, the camera permission, then scan mode. Order, illustrations, actions and timing are
 * here; the texts are the `tutorial` namespace's (every language), their `{{title}}`, `{{author}}` and `{{publisher}}`
 * filled from the book. The content's `tutorial` (written for older apps) is never read.
 */

/** The book fields the steps show */
export type OnboardingBook = Pick<BookData, "title" | "author" | "publisher">;

/** The drawings of the steps (`<gold-illustration>`, files in public/) */
export const ONBOARDING_ILLUSTRATIONS = {
  intro: "/assets/illustrations/tutorial-step-1.svg",
  camera: "/assets/illustrations/tutorial-step-2.svg",
} as const;

/** The steps in their order, translated now (the language is fixed while the app runs – a change reloads it) */
export const onboardingSteps = (book: OnboardingBook): Step[] => {
  // The component escapes the filled text itself (and turns *emphasis* into markup)
  const values = { title: book.title, author: book.author, publisher: book.publisher ?? "", interpolation: { escapeValue: false } };
  return [
    { ...SPLASH_STEP },
    { id: "intro", index: 1, description: t("tutorial:intro.text", values), illustration: ONBOARDING_ILLUSTRATIONS.intro, button: t("tutorial:intro.button") },
    { id: "camera", index: 2, description: t("tutorial:camera.text"), illustration: ONBOARDING_ILLUSTRATIONS.camera, button: t("tutorial:camera.button"), action: "camera" },
    { id: "done", index: 3, title: t("tutorial:done.title"), button: t("tutorial:done.button"), action: "scan" },
  ];
};
