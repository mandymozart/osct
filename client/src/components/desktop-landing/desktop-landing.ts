import { t } from "i18next";
import { LANDING_SOURCE, SOURCE_PARAM } from "@/services/ArrivalService";
import { adoptDesignStyles } from "@/styles";
import { experiencePrefix, hideStaticSplash } from "@/utils";
import { bookCoverUrl, sheetUrl, spreadSheets } from "@/utils/book-cover";
import { getExperience, getScenes } from "@/utils/game-config";
import { ONBOARDING_ICON_SRC } from "@/utils/static-splash-html";
import { isDesktopVisitor, isLandingFreePath, landingSkipped, readDeviceSignals } from "./desktop-visitor";
import { LANDING_CONFIG, type LandingConfig } from "./landing-config";
import { LANDING_ATTRIBUTE, pick, renderLanding, STATIC_LANDING_ID, type LandingTexts } from "./landing-html";
import { scanStageData } from "./scan-stage-data";
import type { ScanStage } from "./scan-stage";

/** The QR code library the dev tools load too (`public/assets/deps/qrcode.js`, davidshimjs/qrcodejs) */
const QR_SCRIPT = "/assets/deps/qrcode.js";
const QR_SCRIPT_ID = "qrcode-script";
/** How long the static landing (index.html) waits at most for this page's images and QR code before making way */
const TAKEOVER_MS = 2000;

/** The address the landing page's QR code opens: this experience here (`/<experience>/`, #343), with the landing page as its source (`?s=lp1`) */
export const landingQrUrl = (origin: string = location.origin, prefix: string = experiencePrefix()): string =>
  `${origin}${prefix}/?${SOURCE_PARAM}=${LANDING_SOURCE}`;

/**
 * <desktop-landing>: the page for visitors who open the app on a computer (#293, redesigned #324 on the book's and the
 * app's design – agents/DESIGN.md: black, the gold gradient, Areal, the glass buttons). A hero with the experience's
 * title set as on the book's title page, the book's images scattered around it as on its pages, the Mark, and the scan
 * stage – the book open, a phone scanning it, the model through its screen (#354, scan-stage.ts); then a QR code that
 * opens the app on the phone (`?s=lp1`, counted in the admin – #324) with the address; the book and the T-shirt in the
 * Building Fictions shop.
 * A computer does not enter the experience nor install the app (#354, Tilman 2026-11-23: "the desktop does not allow to
 * enter the experience. you need to switch to phone or tablet"); only `landingSkipped` (sessionStorage, set by hand in
 * the browser's dev tools) lets a developer past it.
 *
 * Shown only when `isDesktopVisitor` says so – never on phones and tablets, never in the installed app – and then over
 * everything except the dev tools; the static splash makes way. `main.ts` waits for `whenDone()` before the app's
 * start (onboarding, the opened link, the camera), so nothing starts behind it.
 *
 * The first paint is not this element's (#343): index.html carries the same page as a static landing (landing-html.ts,
 * shown by the inline decision in the head – landing-decision-html.ts). This element renders underneath it and, once
 * its images and the QR code are there, takes the static page's scroll position and removes it – no flash. When it
 * decides otherwise (a window made narrow meanwhile), the static page goes and the static splash shows again.
 */
export class DesktopLanding extends HTMLElement {
  private config: LandingConfig = LANDING_CONFIG;
  private resolveDone: () => void = () => {};
  private done: Promise<void> = new Promise(resolve => (this.resolveDone = resolve));
  private shown = false;
  private frame = 0;
  private stage: ScanStage | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  connectedCallback() {
    this.shown = isDesktopVisitor(readDeviceSignals()) && !landingSkipped() && !isLandingFreePath(location.pathname);
    this.toggleAttribute("hidden", !this.shown);
    if (!this.shown) {
      removeStaticLanding();
      this.resolveDone();
      return;
    }
    this.render();
    this.addEventListener("pointermove", this.handlePointer);
    void hideStaticSplash();
    void this.showCover();
    void this.takeOver(this.showQrCode());
    void this.showStage();
  }

  /**
   * The hero's scan stage (#354): three.js and the model load lazily, after the page is up; without WebGL or a model in
   * the content, the stage stays its quiet glow
   */
  private async showStage() {
    const box = this.shadowRoot?.querySelector<HTMLElement>(".stage");
    const data = scanStageData(getScenes(), this.config.scanEntries);
    if (!box || !data) return;
    try {
      const { ScanStage } = await import("./scan-stage");
      if (!this.shown || !box.isConnected) return;
      const experience = getExperience();
      const prints = new Set(data.prints.map(print => print.src));
      this.stage = new ScanStage(box, data, {
        sheets: Promise.all([bookCoverUrl(), spreadSheets(data.pages, 3)]).then(([cover, found]) => ({
          cover,
          spread: found ? sheetUrl(found.spread) : null,
          earlier: (found?.earlier ?? []).map(sheetUrl).filter((src): src is string => !!src),
        })),
        title: experience.title,
        author: experience.book?.author ?? "",
        markSrc: ONBOARDING_ICON_SRC,
        pageImages: pick(getScenes().flatMap(scene => scene.targets.map(target => target.imageSrc)).filter(src => !prints.has(src)), 6, 354),
      });
      await this.stage.load();
    } catch (error) {
      console.warn("[landing] scan stage:", error);
      this.stage?.stop();
      this.stage = null;
    }
  }

  /** The static landing makes way once this page has painted the same: its images decoded and the QR code drawn (at most `TAKEOVER_MS`) */
  private async takeOver(qrCode: Promise<void>) {
    const staticLanding = document.getElementById(STATIC_LANDING_ID);
    if (!staticLanding) return;
    const ready = qrCode.then(() => Promise.all(
      Array.from(this.shadowRoot?.querySelectorAll<HTMLImageElement>(".hero img, .qr-code img") ?? [])
        .map(image => image.decode?.().catch(() => undefined)),
    ));
    await Promise.race([ready, new Promise(resolve => setTimeout(resolve, TAKEOVER_MS))]);
    if (!this.shown) return;
    this.scrollTop = staticLanding.scrollTop;
    staticLanding.remove();
  }

  disconnectedCallback() {
    this.removeEventListener("pointermove", this.handlePointer);
    cancelAnimationFrame(this.frame);
    this.stage?.stop();
    this.stage = null;
  }

  /** Resolves at once when the page is not shown, else never: a computer stays on the landing page */
  whenDone(): Promise<void> {
    return this.done;
  }

  /** The scattered images drift a little against the pointer (depth by size) – off with reduced motion */
  private handlePointer = (event: PointerEvent) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const x = event.clientX / Math.max(1, innerWidth) - 0.5;
      const y = event.clientY / Math.max(1, innerHeight) - 0.5;
      this.shadowRoot?.querySelector<HTMLElement>(".hero")?.style.setProperty("--px", x.toFixed(3));
      this.shadowRoot?.querySelector<HTMLElement>(".hero")?.style.setProperty("--py", y.toFixed(3));
    });
  };

  /** Items with `cover`: the book's cover from the content replaces the placeholder picture */
  private async showCover() {
    const images = this.config.shop
      .filter(item => item.cover)
      .map(item => this.shadowRoot?.querySelector<HTMLImageElement>(`[data-item="${item.id}"] img`));
    if (!images.length) return;
    const cover = await bookCoverUrl();
    if (cover) images.forEach(image => image && (image.src = cover));
  }

  /** The QR code of `landingQrUrl()`, drawn by the shared QR library (loaded once); the address stays as text below */
  private async showQrCode() {
    const box = this.shadowRoot?.querySelector<HTMLElement>(".qr-code");
    if (!box) return;
    try {
      await loadQrLibrary();
    } catch {
      box.toggleAttribute("hidden", true);
      return;
    }
    if (!window.QRCode) return;
    box.replaceChildren();
    new window.QRCode(box, {
      text: landingQrUrl(),
      width: 512,
      height: 512,
      colorDark: "#000000",
      colorLight: "#f5e7c8",
      correctLevel: window.QRCode.CorrectLevel?.M,
    });
    box.querySelector("img")?.setAttribute("alt", t("landing:qrAlt"));
    box.querySelector("canvas")?.setAttribute("aria-hidden", "true");
  }

  /** The page from landing-html.ts – the same markup the build writes into index.html as the static landing (#343) */
  private render() {
    if (!this.shadowRoot) return;
    const experience = getExperience();
    const author = experience.book?.author ?? "";
    const params = { title: experience.title, author };   // t() escapes them
    // Literal keys, so the extractor keeps them (npm run i18n)
    const texts: LandingTexts = {
      label: t("landing:label"), intro: t("landing:intro", params), getApp: t("landing:getApp"),
      openOnPhone: t("landing:openOnPhone"),
      shop: t("landing:shop"), shopBook: t("landing:shopBook"), shopShirt: t("landing:shopShirt"), toShop: t("landing:toShop"),
      previewAlt: t("landing:previewAlt"), scan: t("landing:scan"), qrAlt: t("landing:qrAlt"), privacy: t("landing:privacy"),
    };
    this.shadowRoot.innerHTML = renderLanding({
      ...this.config,
      texts,
      title: experience.title,
      author,
      publisher: experience.book?.publisher ?? "",
      images: getScenes().flatMap(scene => scene.targets.map(target => target.imageSrc)),
      privacyHref: `${experiencePrefix()}/privacy`,
    });
    const address = this.shadowRoot.querySelector(".address");
    if (address) address.textContent = location.host;
  }
}

/** The static landing (index.html) goes and the static splash may show again (`<html data-osct-landing>` hides it) */
const removeStaticLanding = (): void => {
  document.getElementById(STATIC_LANDING_ID)?.remove();
  document.documentElement.removeAttribute(LANDING_ATTRIBUTE);
};

/** Loads the shared QR code library once (the dev tools' QR generator uses the same script) */
const loadQrLibrary = (): Promise<void> => {
  if (window.QRCode) return Promise.resolve();
  const existing = document.getElementById(QR_SCRIPT_ID) as HTMLScriptElement | null;
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("qrcode.js")), { once: true });
    if (!existing) {
      script.id = QR_SCRIPT_ID;
      script.src = QR_SCRIPT;
      document.head.appendChild(script);
    }
  });
};

customElements.define("desktop-landing", DesktopLanding);
