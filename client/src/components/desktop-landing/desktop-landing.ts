import { t } from "i18next";
import { goldButton } from "@/components/buttons";
import { MEDIA_QUERY } from "@/constants";
import { LANDING_SOURCE, SOURCE_PARAM } from "@/services/ArrivalService";
import { adoptDesignStyles } from "@/styles";
import { escapeHtml, hideStaticSplash } from "@/utils";
import { bookCoverUrl } from "@/utils/book-cover";
import { getExperience, getScenes } from "@/utils/game-config";
import { ONBOARDING_ICON_SRC } from "@/utils/static-splash-html";
import "@/components/settings";
import { isDesktopVisitor, landingSkipped, readDeviceSignals, skipLanding } from "./desktop-visitor";
import { LANDING_CONFIG, type LandingConfig, type ShopItem } from "./landing-config";

/** The QR code library the dev tools load too (`public/assets/deps/qrcode.js`, davidshimjs/qrcodejs) */
const QR_SCRIPT = "/assets/deps/qrcode.js";
const QR_SCRIPT_ID = "qrcode-script";
/** How many of the book's images drift over the hero */
const SCATTER_COUNT = 14;

/**
 * Where the scattered images lie (#324): spots around the hero's edges, in % of its box, a size in rem and a turn – as
 * the book scatters its images over the white pages (title spread, back cover). The title, the text and the phone stay free.
 */
const SCATTER: ReadonlyArray<{ x: number; y: number; size: number; turn: number }> = [
  { x: 20, y: 2, size: 5.5, turn: 3 }, { x: 36, y: 4, size: 5, turn: -2 }, { x: 52, y: 6, size: 6.5, turn: 4 },
  { x: 93, y: 4, size: 5.5, turn: -3 }, { x: -3, y: 40, size: 6.5, turn: -4 }, { x: 52, y: 52, size: 6.5, turn: -3 },
  { x: 56, y: 80, size: 5, turn: 2 }, { x: 94, y: 30, size: 7, turn: 3 }, { x: 93, y: 62, size: 6, turn: -2 },
  { x: 86, y: 90, size: 7.5, turn: -4 }, { x: 3, y: 90, size: 6, turn: 3 }, { x: 20, y: 91, size: 5, turn: -2 },
  { x: 38, y: 89, size: 6.5, turn: 2 }, { x: 64, y: 93, size: 5, turn: -5 },
];

/** A stable shuffle (the same images every visit of the same content): a seeded linear congruential generator */
const pick = <T>(items: readonly T[], count: number, seed = 324): T[] => {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, count);
};

/** The address the landing page's QR code opens: the app here, with the landing page as its source (`?s=lp1`) */
export const landingQrUrl = (origin: string = location.origin): string => `${origin}/?${SOURCE_PARAM}=${LANDING_SOURCE}`;

/**
 * <desktop-landing>: the page for visitors who open the app on a computer (#293, redesigned #324 on the book's and the
 * app's design – agents/DESIGN.md: black, the gold gradient, Areal, the glass buttons). A hero with the experience's
 * title set as on the book's title page, the book's images scattered around it as on its pages, the Mark, and the app
 * in a phone frame; then a QR code that opens the app on the phone (`?s=lp1`, counted in the admin – #324) with the
 * address and the install button; how it works in three steps; the book and the T-shirt in the Building Fictions shop.
 * "Open the app here" leaves it for the app (remembered for the tab), so the app stays usable on a computer (RULES #1).
 *
 * Shown only when `isDesktopVisitor` says so – never on phones and tablets, never in the installed app – and then over
 * everything except the dev tools; the static splash makes way. `main.ts` waits for `whenDone()` before the app's
 * start (onboarding, the opened link, the camera), so nothing starts behind it.
 */
export class DesktopLanding extends HTMLElement {
  private config: LandingConfig = LANDING_CONFIG;
  private resolveDone: () => void = () => {};
  private done: Promise<void> = new Promise(resolve => (this.resolveDone = resolve));
  private shown = false;
  private frame = 0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  connectedCallback() {
    this.shown = isDesktopVisitor(readDeviceSignals()) && !landingSkipped();
    this.toggleAttribute("hidden", !this.shown);
    if (!this.shown) {
      this.resolveDone();
      return;
    }
    this.render();
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.addEventListener("pointermove", this.handlePointer);
    void hideStaticSplash();
    void this.showCover();
    void this.showQrCode();
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.removeEventListener("pointermove", this.handlePointer);
    cancelAnimationFrame(this.frame);
  }

  /** Resolves at once when the page is not shown, else when the visitor opens the app here */
  whenDone(): Promise<void> {
    return this.done;
  }

  private handleClick = (event: Event) => {
    const action = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action !== "continue") return;
    skipLanding();
    this.shown = false;
    this.setAttribute("hidden", "");
    this.removeEventListener("pointermove", this.handlePointer);
    this.resolveDone();
  };

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

  /** The book's images (the experience's targets), a stable pick */
  private scatter(): string {
    const images = [...new Set(getScenes().flatMap(scene => scene.targets.map(target => target.imageSrc)).filter(Boolean))];
    return pick(images, Math.min(SCATTER_COUNT, SCATTER.length))
      .map((src, i) => {
        const spot = SCATTER[i];
        const depth = (spot.size / 10).toFixed(2);
        return `<img class="float" src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"
          style="--x:${spot.x}%;--y:${spot.y}%;--size:${spot.size}rem;--turn:${spot.turn}deg;--depth:${depth};--delay:${(i * -1.7).toFixed(1)}s" />`;
      })
      .join("");
  }

  private shopItem(item: ShopItem): string {
    const name = item.id === "book" ? t("landing:shopBook") : t("landing:shopShirt");
    return /* html */ `
      <li class="item" data-item="${item.id}">
        <div class="picture"><img src="${escapeHtml(item.image)}" alt="" /></div>
        <span class="name">${name}</span>
        ${goldButton({ label: t("landing:toShop"), href: item.url, attrs: { "aria-label": `${name} – ${t("landing:toShop")}` } })}
      </li>
    `;
  }

  private render() {
    if (!this.shadowRoot) return;
    const experience = getExperience();
    const author = experience.book?.author ?? "";
    const publisher = experience.book?.publisher ?? "";
    const params = { title: experience.title, author };   // t() escapes them
    const address = escapeHtml(location.host);
    const { previewImage, previewVideo, shop } = this.config;
    const preview = previewVideo
      ? `<video src="${escapeHtml(previewVideo)}" poster="${escapeHtml(previewImage)}" autoplay muted loop playsinline aria-label="${t("landing:previewAlt")}"></video>`
      : `<img src="${escapeHtml(previewImage)}" alt="${t("landing:previewAlt")}" />`;
    // The title as on the book's title page: its words on lines of their own, the "and" / "&" between them alone
    const titleLines = experience.title.split(/\s+(&|and|und|et|en)\s+/i).map(part => escapeHtml(part));
    // Literal keys, so the extractor keeps them (npm run i18n)
    const steps = [
      [t("landing:step1Title"), t("landing:step1")],
      [t("landing:step2Title"), t("landing:step2")],
      [t("landing:step3Title"), t("landing:step3")],
    ].map(([title, text], i) => /* html */ `
      <li class="step">
        <span class="step-number gold">${i + 1}</span>
        <span class="step-title">${title}</span>
        <span class="step-text muted">${text}</span>
      </li>`).join("");
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          position: fixed;
          inset: 0;
          z-index: 1300;                 /* over the app and its notices, under the dev tools */
          overflow-y: auto;
          overflow-x: hidden;
          background: var(--app-background);
          color: var(--color-on-dark);
          --gutter: clamp(1.5rem, 6vw, 6rem);
          --column: 72rem;
        }
        :host([hidden]) { display: none; }
        .landing { min-height: 100%; }
        .wrap { box-sizing: border-box; width: 100%; max-width: calc(var(--column) + 2 * var(--gutter)); margin: 0 auto; padding: 0 var(--gutter); }

        /* Hero: the book's images scattered around the title, the onboarding's dark vignette over them */
        .hero {
          position: relative;
          min-height: max(40rem, 100vh);
          display: grid;
          align-items: center;
          isolation: isolate;
          --px: 0;
          --py: 0;
        }
        .hero::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background: radial-gradient(ellipse 46% 56% at 40% 50%, #000 0%, rgba(0, 0, 0, .92) 45%, rgba(0, 0, 0, .55) 75%, rgba(0, 0, 0, .2) 100%);
          pointer-events: none;
        }
        .scatter { position: absolute; inset: 0; z-index: -2; overflow: hidden; pointer-events: none; }
        .float {
          position: absolute;
          left: var(--x);
          top: var(--y);
          width: var(--size);
          height: auto;
          max-height: calc(var(--size) * 1.4);
          object-fit: contain;
          filter: grayscale(1) contrast(1.1) brightness(.9);
          opacity: .7;
          transform:
            translate(calc(var(--px) * var(--depth) * -2.5rem), calc(var(--py) * var(--depth) * -2.5rem))
            rotate(var(--turn));
          transition: transform 1.2s cubic-bezier(.2, .7, .2, 1);
          animation: drift 14s ease-in-out var(--delay) infinite alternate;
        }
        @keyframes drift { to { translate: 0 -.75rem; } }
        .hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 4rem;
          padding-block: clamp(4rem, 10vh, 7rem);
        }
        .mark { width: 6.25rem; height: auto; display: block; margin: 0 0 2rem -.5rem; filter: drop-shadow(0 0 1.5rem rgba(90, 200, 60, .25)); }
        .kicker { margin: 0 0 1.25rem; letter-spacing: .2em; text-transform: uppercase; font-size: var(--text-size-small); }
        h1 {
          margin: 0;
          font-weight: 400;
          font-size: clamp(3rem, 7.2vw, 7rem);
          line-height: .98;
          letter-spacing: -.01em;
        }
        h1 .line { display: block; width: fit-content; }
        h1 .and { font-size: .55em; line-height: 1.3; padding-left: .1em; }
        .author { margin: 1.75rem 0 0; font-size: clamp(1.25rem, 2vw, 1.75rem); width: fit-content; }
        .intro { margin: 2rem 0 0; max-width: 32rem; font-size: 1.125rem; line-height: 1.55; }
        .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.5rem; margin: 2.5rem 0 0; }
        .scroll-hint { font-size: var(--text-size-small); letter-spacing: .12em; text-transform: uppercase; }

        .phone {
          box-sizing: border-box;
          width: clamp(15rem, 21vw, 20rem);
          aspect-ratio: 390 / 844;
          border: var(--phone-frame-width) solid var(--phone-frame);
          border-radius: 2.75rem;
          overflow: hidden;
          background: var(--app-background);
          box-shadow: var(--shadow-bronze), 0 2rem 5rem rgba(0, 0, 0, .8);
          transform: perspective(80rem) rotateY(-9deg) rotateX(3deg) rotate(1.5deg);
          animation: hover 7s ease-in-out infinite alternate;
        }
        @keyframes hover { to { translate: 0 -.75rem; } }
        .phone img, .phone video { display: block; width: 100%; height: 100%; object-fit: cover; }

        /* Get the app: the QR code on a champagne card, the address, installing */
        .get {
          padding-block: clamp(5rem, 12vh, 8rem);
          border-top: var(--rule);
          background: radial-gradient(ellipse 60% 70% at 25% 40%, rgba(127, 96, 50, .18), transparent 70%);
        }
        .get-grid { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: clamp(2.5rem, 6vw, 6rem); align-items: center; }
        .qr-card {
          box-sizing: border-box;
          width: 17rem;
          padding: 1.25rem;
          border-radius: 1.5rem;
          background: #f5e7c8;
          box-shadow: 0 0 0 1px rgba(245, 231, 200, .35), 0 0 4rem rgba(210, 174, 90, .35), 0 1.5rem 4rem rgba(0, 0, 0, .7);
          transform: rotate(-2deg);
        }
        .qr-code { aspect-ratio: 1; }
        .qr-code img, .qr-code canvas { display: block; width: 100% !important; height: auto !important; image-rendering: pixelated; }
        .qr-caption { margin: .875rem 0 0; color: #3b2a12; font-size: var(--text-size-small); text-align: center; letter-spacing: .08em; text-transform: uppercase; }
        h2 { margin: 0 0 1.25rem; font-weight: 400; font-size: clamp(2rem, 3.6vw, 3.25rem); line-height: 1.05; width: fit-content; }
        .lead { margin: 0 0 1.5rem; max-width: 34rem; font-size: 1.125rem; line-height: 1.55; }
        .address { display: inline-block; margin: 0 0 1.75rem; font-size: 1.5rem; user-select: all; }
        settings-install { padding: 0 0 1rem; }
        .small { font-size: var(--text-size-small); }

        .steps { list-style: none; margin: clamp(4rem, 9vh, 6rem) 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2.5rem; }
        .step { display: grid; gap: .5rem; padding-top: 1.25rem; border-top: var(--rule); }
        .step-number { font-size: 3rem; line-height: 1; width: fit-content; }
        .step-title { font-size: 1.125rem; }
        .step-text { line-height: 1.5; }

        /* The shop */
        .shop-section { padding-block: clamp(4rem, 10vh, 7rem); border-top: var(--rule); }
        .shop { display: flex; flex-wrap: wrap; gap: 4rem; margin: 0; padding: 0; list-style: none; }
        .item { display: flex; flex-direction: column; align-items: flex-start; gap: .75rem; }
        .picture { height: 12rem; display: flex; align-items: flex-end; }
        .picture img { height: 100%; max-width: 12rem; object-fit: contain; display: block; filter: drop-shadow(0 1rem 2rem rgba(0, 0, 0, .7)); }
        .name { font-size: 1.125rem; }

        footer { padding-block: 2.5rem 3rem; border-top: var(--rule); }
        footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; }

        @media (prefers-reduced-motion: reduce) {
          .float, .phone { animation: none; transition: none; }
        }
        @media (${MEDIA_QUERY.TABLET}) {
          .hero-grid { grid-template-columns: minmax(0, 1fr); }
          .phone { justify-self: center; transform: none; }
          .get-grid { grid-template-columns: minmax(0, 1fr); }
          .qr-card { justify-self: start; }
          .steps { grid-template-columns: minmax(0, 1fr); }
        }
      </style>
      <main class="landing design" aria-label="${t("landing:label")}">
        <section class="hero">
          <div class="scatter" aria-hidden="true">${this.scatter()}</div>
          <div class="wrap hero-grid">
            <div class="intro-block">
              <img class="mark" src="${ONBOARDING_ICON_SRC}" alt="" />
              <p class="kicker muted">${t("landing:kicker")}</p>
              <h1>${titleLines.map((part, i) => `<span class="line gold shimmer${i % 2 ? " and" : ""}">${part}</span>`).join("")}</h1>
              ${author ? `<p class="author gold">${escapeHtml(author)}</p>` : ""}
              <p class="intro">${t("landing:intro", params)}</p>
              <div class="actions">
                ${goldButton({ label: t("landing:openHere"), shape: "button", primary: true, attrs: { "data-action": "continue" } })}
                <a class="scroll-hint muted" href="#get">${t("landing:getApp")} ↓</a>
              </div>
            </div>
            <aside class="phone">${preview}</aside>
          </div>
        </section>

        <section class="get" id="get">
          <div class="wrap">
            <div class="get-grid">
              <figure class="qr-card" style="margin:0">
                <div class="qr-code" role="img" aria-label="${t("landing:qrAlt")}"></div>
                <figcaption class="qr-caption">${t("landing:scan")}</figcaption>
              </figure>
              <div>
                <h2 class="gold">${t("landing:getApp")}</h2>
                <p class="lead">${t("landing:openOnPhone")}</p>
                <span class="address gold">${address}</span>
                <settings-install></settings-install>
                <p class="muted small">${t("landing:openHereNote")}</p>
              </div>
            </div>
            <ol class="steps">${steps}</ol>
          </div>
        </section>

        <section class="shop-section">
          <div class="wrap">
            <h2 class="gold">${t("landing:shop")}</h2>
            <ul class="shop">${shop.map(item => this.shopItem(item)).join("")}</ul>
          </div>
        </section>

        <footer>
          <div class="wrap muted small">
            <span>${escapeHtml(experience.title)}${author ? ` · ${escapeHtml(author)}` : ""}</span>
            ${publisher ? `<span>${escapeHtml(publisher)}</span>` : ""}
          </div>
        </footer>
      </main>
    `;
  }
}

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
