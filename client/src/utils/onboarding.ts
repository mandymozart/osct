import { t } from "i18next";
import type { ExperienceData, Step } from "@/types";
import { SPLASH_STEP, splashFields } from "./static-splash-html";

/**
 * The onboarding – the reader's own UI, the same for every experience (#236): the splash (the experience's title, its
 * printed book's author and publisher), what the app does, what its entries are called (marginalia, #281), the camera permission, then scan mode. Order, illustrations, actions and timing are
 * here; the texts are the `tutorial` namespace's (every language), their `{{title}}`, `{{author}}` and `{{publisher}}`
 * filled from the experience (`splashFields` – "" without a printed book). The content's `tutorial` (written for older
 * apps) is never read.
 */

/** What the steps show of the experience: its title and its printed book */
export type OnboardingExperience = Pick<ExperienceData, "title" | "book">;

/**
 * The drawings of the steps (`<gold-illustration>`, files in public/). The camera step has none since the design
 * review (#281, design p. 1); its drawing `tutorial-step-2.svg` stays in public/ for now.
 */
export const ONBOARDING_ILLUSTRATIONS = {
  intro: "/assets/illustrations/tutorial-step-1.svg",
} as const;

/** The steps in their order, translated now (the language is fixed while the app runs – a change reloads it) */
export const onboardingSteps = (experience: OnboardingExperience): Step[] => {
  // The component escapes the filled text itself (and turns *emphasis* into markup)
  const values = { ...splashFields(experience), interpolation: { escapeValue: false } };
  return [
    { ...SPLASH_STEP },
    { id: "intro", index: 1, description: t("tutorial:intro.text", values), illustration: ONBOARDING_ILLUSTRATIONS.intro, button: t("tutorial:intro.button") },
    { id: "marginalia", index: 2, description: t("tutorial:marginalia.text"), button: t("tutorial:marginalia.button") },
    { id: "camera", index: 3, description: t("tutorial:camera.text"), button: t("tutorial:camera.button"), action: "camera" },
    { id: "done", index: 4, title: t("tutorial:done.title"), button: t("tutorial:done.button"), action: "scan" },
  ];
};
