import { DESIGN_PRIMITIVES_CSS } from "../brand/design-css";
import { ONBOARDING_ICON_SRC } from "../brand/marks";
import type { LandingData } from "./data";
import type { IQRCodeStatic } from "./qrcode";
import { CONTAINED_ATTRIBUTE, type LandingTexts, renderKeyOf, renderLanding, SKELETON_ATTRIBUTE } from "./landing-html";

/** The QR code library the dev tools load too (`public/assets/deps/qrcode.js`, davidshimjs/qrcodejs) */
const QR_SCRIPT = "/assets/deps/qrcode.js";
const QR_SCRIPT_ID = "qrcode-script";

/** Everything the landing page shows: the experience's data and what the page around it gives */
export interface LandingInput {
  data: LandingData;
  /** The `landing` namespace in the reader's language, title and author filled in (`texts.ts`) */
  texts: LandingTexts;
  /** What the QR code opens: the experience on a phone, with the landing as its source (`?s=lp1`, #324) */
  qrUrl: string;
  /** The address written below it for typing (the site's host) */
  address: string;
  /** The footer's "Privacy & terms": the static page below the experience's path */
  privacyHref: string;
}

export interface LandingOptions {
  /** Inside another page's box (the editor's stage) instead of over the window */
  contained?: boolean;
  /**
   * CSS put first into the shadow root: a host page whose own UI must not get the brand gives the brand's tokens here, on
   * `:host` (the editor – `ui/brand/tokens.css`); the reader has them on its document
   */
  styles?: string;
}

export interface LandingView {
  /** Resolves when the QR code is drawn and the hero runs (or has given up) */
  readonly ready: Promise<void>;
  /**
   * The page again with new texts, title, shop or images – the hero's stage and the QR code stay as they run (the editor's
   * landing workspace while the person types, #365). A new hero needs a new mount.
   */
  update(input: LandingInput): void;
  /** Stops the hero and the listeners; the markup stays */
  stop(): void;
}

/** The parts of a rendered page that keep running across `update`: the hero's stage and the QR code */
const KEPT = [".stage", ".qr-code"] as const;

const renderInput = (input: LandingInput): string => renderLanding({
  shop: input.data.shop, texts: input.texts, title: input.data.title, author: input.data.author, publisher: input.data.publisher,
  images: input.data.images, privacyHref: input.privacyHref,
});

/** What needs the page's data after a render: the address, and the book's cover on the shop's cover items */
const fillIn = (root: ShadowRoot, input: LandingInput): void => {
  const address = root.querySelector(".address");
  if (address) address.textContent = input.address;
  const cover = input.data.cover;
  if (cover) root.querySelectorAll<HTMLImageElement>("[data-cover] img").forEach(image => { image.src = cover; });
};

/**
 * The desktop landing page (#293, #324, #354; a piece of its own, #355): a function of the landing's data and a host
 * element, nothing of the app – so the same page shows on a computer instead of the app (client/src/landing/entry.ts)
 * and on the editor's landing workspace with an experience's draft (#356, `contained`). agents/DESIGN.md: black, the gold
 * gradient, Areal, the glass buttons; the brand's tokens (`ui/brand/tokens.css`) come from the host's document or from
 * `styles`, the font's faces from the host's document (`ui/brand/font-face.ts`).
 *
 * Renders `landing-html.ts`'s page into the host's shadow root – or keeps what is there when it is the same render (the
 * static landing in index.html, `renderKey`: no flash, no image loaded twice) – and fills in, one after the other, what
 * needs the browser: the address, the book's cover in the shop, the QR code (the shared QR library, loaded once), and
 * the hero's scan stage (`hero.ts` with three.js, loaded lazily – a quiet placeholder until it runs). The scattered
 * images drift a little against the pointer (off with reduced motion).
 */
export const mountLanding = (host: HTMLElement, input: LandingInput, options: LandingOptions = {}): LandingView => {
  const { data, texts } = input;
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const head = `<style>${options.styles ?? ""}${DESIGN_PRIMITIVES_CSS}</style>`;
  const html = renderInput(input);
  if (root.querySelector<HTMLElement>("main")?.dataset.render !== renderKeyOf(html)) root.innerHTML = `${head}${html}`;
  host.removeAttribute(SKELETON_ATTRIBUTE);
  host.toggleAttribute(CONTAINED_ATTRIBUTE, !!options.contained);
  fillIn(root, input);

  let frame = 0;
  let stopped = false;
  let stage: { stop(): void } | null = null;
  const drift = (event: PointerEvent) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const hero = root.querySelector<HTMLElement>(".hero");
      hero?.style.setProperty("--px", (event.clientX / Math.max(1, innerWidth) - 0.5).toFixed(3));
      hero?.style.setProperty("--py", (event.clientY / Math.max(1, innerHeight) - 0.5).toFixed(3));
    });
  };
  host.addEventListener("pointermove", drift);

  const loaded = (selector: string) => root.querySelector(selector)?.classList.remove("loading");
  const qrCode = drawQrCode(root, input.qrUrl, texts.qrAlt).finally(() => loaded(".qr-code"));
  const box = root.querySelector<HTMLElement>(".stage");
  const heroData = data.hero;
  const heroRuns = box && heroData
    ? import("./hero")
      .then(({ startHero }) => (stopped ? null : startHero(box, heroData, data, ONBOARDING_ICON_SRC)))
      .then(started => {
        if (stopped) started?.stop();
        else stage = started;
      })
      .catch(error => console.warn("[landing] scan stage:", error))
    : Promise.resolve();
  const ready = Promise.all([qrCode, heroRuns.finally(() => loaded(".stage"))]).then(() => undefined);

  return {
    ready,
    update(next: LandingInput) {
      const fresh = renderInput(next);
      if (root.querySelector<HTMLElement>("main")?.dataset.render === renderKeyOf(fresh)) return;
      const kept = KEPT.map(selector => root.querySelector(selector));
      root.innerHTML = `${head}${fresh}`;
      KEPT.forEach((selector, i) => {
        const old = kept[i];
        if (old) root.querySelector(selector)?.replaceWith(old);
      });
      fillIn(root, next);
    },
    stop() {
      stopped = true;
      host.removeEventListener("pointermove", drift);
      cancelAnimationFrame(frame);
      stage?.stop();
      stage = null;
    },
  };
};

/** The shared QR library once its script ran (a global of the page – `window.QRCode`) */
const qrLibrary = (): IQRCodeStatic | undefined => (window as { QRCode?: IQRCodeStatic }).QRCode;

/** The QR code, drawn by the shared QR library; without it the card goes and the address stays */
const drawQrCode = async (root: ShadowRoot, text: string, alt: string): Promise<void> => {
  const box = root.querySelector<HTMLElement>(".qr-code");
  if (!box) return;
  try {
    await loadQrLibrary();
  } catch {
    box.closest("figure")?.toggleAttribute("hidden", true);
    return;
  }
  const QRCode = qrLibrary();
  if (!QRCode) return;
  box.replaceChildren();
  new QRCode(box, {
    text,
    width: 512,
    height: 512,
    colorDark: "#000000",
    colorLight: "#f5e7c8",
    correctLevel: QRCode.CorrectLevel?.M,
  });
  box.querySelector("img")?.setAttribute("alt", alt);
  box.querySelector("canvas")?.setAttribute("aria-hidden", "true");
};

/** Loads the shared QR code library once (the dev tools' QR generator uses the same script) */
const loadQrLibrary = (): Promise<void> => {
  if (qrLibrary()) return Promise.resolve();
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

/** Puts the experience's parts of a mounted or static page back into placeholders (`data-skeleton`) */
export const showSkeleton = (host: HTMLElement): void => host.setAttribute(SKELETON_ATTRIBUTE, "");
