import { t } from "i18next";
import { goldButton } from "@/components/buttons";
import { MEDIA_QUERY } from "@/constants";
import { adoptDesignStyles } from "@/styles";
import { escapeHtml, hideStaticSplash } from "@/utils";
import { bookCoverUrl } from "@/utils/book-cover";
import { getBook } from "@/utils/game-config";
import "@/components/settings";
import { isDesktopVisitor, landingSkipped, readDeviceSignals, skipLanding } from "./desktop-visitor";
import { LANDING_CONFIG, type LandingConfig, type ShopItem } from "./landing-config";

/**
 * <desktop-landing>: the page for visitors who open the app on a computer (#293, design p. 59 "web only"). Left: what
 * this is – the companion to the book – and how to get the app: the address to open on the phone, or install
 * (`<settings-install>`); right: the app inside a phone frame; below: the book and the T-shirt in the Building
 * Fictions shop. "Open the app here" leaves it for the app (remembered for the tab), so the app stays usable on a
 * computer as before (RULES #1).
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
    void hideStaticSplash();
    void this.showCover();
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
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
    this.resolveDone();
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
    const book = getBook();
    const params = { title: book.title, author: book.author };   // t() escapes them
    const address = escapeHtml(location.host);
    const { previewImage, previewVideo, shop } = this.config;
    const preview = previewVideo
      ? `<video src="${escapeHtml(previewVideo)}" poster="${escapeHtml(previewImage)}" autoplay muted loop playsinline aria-label="${t("landing:previewAlt")}"></video>`
      : `<img src="${escapeHtml(previewImage)}" alt="${t("landing:previewAlt")}" />`;
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          position: fixed;
          inset: 0;
          z-index: 1300;                 /* over the app and its notices, under the dev tools */
          overflow-y: auto;
          background: var(--onboarding-background);
          color: var(--color-on-dark);
        }
        :host([hidden]) { display: none; }
        .landing {
          box-sizing: border-box;
          min-height: 100%;
          display: grid;
          grid-template-columns: minmax(0, 30rem) auto;
          align-items: center;
          justify-content: center;
          gap: 4rem 7rem;
          padding: 4rem 3rem;
        }
        h1 { margin: 0 0 .25rem; font: inherit; }
        .author { margin: 0 0 1.5rem; }
        p { margin: 0 0 1rem; }
        .address { display: inline-block; margin: 0 0 1rem; user-select: all; }
        .small { font-size: var(--text-size-small); }
        settings-install { padding: 0 0 1rem; }
        .here { margin: 0 0 .5rem; }
        .shop {
          display: flex;
          gap: 2.5rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .item { display: flex; flex-direction: column; align-items: flex-start; gap: .5rem; }
        .picture { height: 7rem; display: flex; align-items: flex-end; }
        .picture img { height: 100%; max-width: 7rem; object-fit: contain; display: block; }
        .phone {
          box-sizing: border-box;
          width: 19rem;
          aspect-ratio: 390 / 844;
          border: var(--phone-frame-width) solid var(--phone-frame);
          border-radius: 2.75rem;
          overflow: hidden;
          background: var(--app-background);
          box-shadow: var(--shadow-bronze);
        }
        .phone img, .phone video { display: block; width: 100%; height: 100%; object-fit: cover; }
        @media (${MEDIA_QUERY.TABLET}) {
          .landing { grid-template-columns: minmax(0, 30rem); gap: 3rem; padding: 3rem 1.5rem; }
          .phone { width: 15rem; justify-self: center; }
        }
      </style>
      <main class="landing design" aria-label="${t("landing:label")}">
        <section class="intro">
          <h1 class="gold shimmer">${escapeHtml(book.title)}</h1>
          <p class="author muted">${escapeHtml(book.author)}</p>
          <p>${t("landing:intro", params)}</p>

          <h2 class="section-title">${t("landing:getApp")}</h2>
          <p>${t("landing:openOnPhone")}</p>
          <span class="address gold">${address}</span>
          <settings-install></settings-install>
          <p class="here">${goldButton({ label: t("landing:openHere"), shape: "button", primary: true, attrs: { "data-action": "continue" } })}</p>
          <p class="muted small">${t("landing:openHereNote")}</p>

          <h2 class="section-title">${t("landing:shop")}</h2>
          <ul class="shop">${shop.map(item => this.shopItem(item)).join("")}</ul>
        </section>
        <aside class="phone">${preview}</aside>
      </main>
    `;
  }
}

customElements.define("desktop-landing", DesktopLanding);
