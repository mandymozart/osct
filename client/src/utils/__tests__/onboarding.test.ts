import { afterEach, describe, expect, it } from "vitest";
import i18next from "i18next";
import { LANGUAGES } from "@/i18n";
import { ONBOARDING_ILLUSTRATIONS, onboardingSteps } from "../onboarding";
import { SPLASH_STEP } from "../static-splash-html";

const book = { title: "Onion Skin & Crocodile Tears", author: "Kévin Bray", publisher: "Building Fictions" };

/** The onboarding is the app's (#236): its steps in code, its texts in the translations, the book's fields filled in */
describe("onboarding", () => {
  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("the splash, what the app does, the camera, then scan mode – in order", () => {
    const steps = onboardingSteps(book);
    expect(steps.map(s => s.id)).toEqual(["splash", "intro", "camera", "done"]);
    expect(steps.map(s => s.index)).toEqual([0, 1, 2, 3]);
    expect(steps[0]).toEqual(SPLASH_STEP);
    expect(steps.map(s => s.action ?? "next")).toEqual(["next", "next", "camera", "scan"]);
    expect(steps.slice(1).every(s => s.button)).toBe(true);
    expect(steps[1].illustration).toBe(ONBOARDING_ILLUSTRATIONS.intro);
    expect(steps[2].illustration).toBe(ONBOARDING_ILLUSTRATIONS.camera);
  });

  it("English: the book's title filled in, unescaped (the component escapes)", async () => {
    await i18next.changeLanguage("en");
    const [, intro, camera, done] = onboardingSteps(book);
    expect(intro.description).toBe("This application allows you to reveal videos, texts and key references hidden in the printed publication *Onion Skin & Crocodile Tears*.");
    expect(intro.button).toBe("Continue");
    expect(camera.description).toContain("\n\nPlease, grant access to proceed.");
    expect(done).toMatchObject({ title: "Thank you!", button: "Access scan" });
  });

  it("German, informal", async () => {
    await i18next.changeLanguage("de");
    const [, intro, camera] = onboardingSteps(book);
    expect(intro.description).toContain("entdeckst du");
    expect(intro.description).toContain("*Onion Skin & Crocodile Tears*");
    expect(camera.button).toBe("Zugriff erlauben");
  });

  it("every language has every text", async () => {
    const english = onboardingSteps(book);
    for (const language of LANGUAGES) {
      await i18next.changeLanguage(language);
      const steps = onboardingSteps(book);
      for (const key of ["intro.text", "intro.button", "camera.text", "camera.button", "done.title", "done.button"]) {
        expect(i18next.exists(`tutorial:${key}`, { lng: language, fallbackLng: false }), `${language}: tutorial:${key}`).toBe(true);
      }
      if (language !== "en") expect(steps[1].description).not.toBe(english[1].description);
    }
  });
});
