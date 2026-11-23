/**
 * The page's entry on a computer (#355): index.html loads this instead of the app when its inline decision says so
 * (`<html data-osct-landing>`, landing-decision-html.ts) – no store, router, pages, dev tools, i18next or service worker.
 * Tilman, 2026-11-23: "shared ui for the landing page should be very little because it basically does not need to load
 * the app at all if its on desktop. including debugging and everything. a skeleton script could handle that right?"
 *
 * The static landing in index.html is up already (the default experience's page, or placeholders on another
 * experience's path). Here: count the arrival (`?s=`, #324), load the experience's landing data (`landing.json`, else
 * derived from its game configuration – data.ts, derive.ts), and mount the page into the static landing's host
 * (the landing piece, ui/landing/mount.ts): the texts in the reader's language, the QR code, then the 3D hero, each as it arrives.
 * Imports name files, never a barrel: a barrel would bring the app along.
 */
import { reportArrival } from "../services/ArrivalService";
import { applyExperienceMeta } from "../utils/experience-meta";
import { activeExperience, contentBaseUrl, defaultExperience, rememberExperience } from "../utils/experience-path";
import { STATIC_LANDING_ID } from "@ui/landing/landing-html";
import { mountLanding } from "@ui/landing/mount";
import { landingTexts } from "@ui/landing/texts";
import { loadLandingData } from "./data";
import { landingQrUrl, privacyHref } from "./links";
import { browserLanguage } from "./texts";

const start = async (): Promise<void> => {
  // A printed code's or a link's source (`?s=bk1`): counted once with the device class, taken out of the address
  reportArrival();
  const experience = activeExperience();
  const language = browserLanguage();
  document.documentElement.lang = language;
  const host = document.getElementById(STATIC_LANDING_ID);
  if (!host) return;
  const data = await loadLandingData({
    baseUrl: contentBaseUrl(),
    bundled: () => import("virtual:osct-landing").then(module => module.default),
    derive: async fetch => (await import("./derive")).deriveLandingData({
      baseUrl: contentBaseUrl(),
      bundled: () => import("virtual:osct-game-config").then(module => module.default),
      fetch,
    }),
  });
  applyExperienceMeta(document, { experience, fallback: defaultExperience(), title: data.title, author: data.author });
  rememberExperience(experience);
  mountLanding(host, {
    data,
    texts: landingTexts(language, { title: data.title, author: data.author }),
    qrUrl: landingQrUrl(),
    address: location.host,
    privacyHref: privacyHref(),
  });
};

start().catch(error => {
  // The static page stays; its placeholders stop – nothing more to wait for
  console.error("[landing] not loaded:", error);
  const root = document.getElementById(STATIC_LANDING_ID)?.shadowRoot;
  root?.querySelectorAll(".loading").forEach(element => element.classList.remove("loading"));
});
