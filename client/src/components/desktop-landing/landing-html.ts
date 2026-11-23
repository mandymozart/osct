/**
 * The desktop landing page's markup and styles as plain functions (#343): `<desktop-landing>` renders them into its
 * shadow root, and the build writes the same page into index.html (`renderStaticLanding`, vite.config.js plugin
 * `osct-static-landing`) so a computer sees the landing at once – before the app's bundle has loaded. Tilman,
 * 2026-11-22: "same thing goes for the browser redirect to that landing page ... write a small script we put in the
 * skeleton and run immediately".
 *
 * Imports are relative and import-free modules only: vite.config.js loads this file.
 */
import { MEDIA_QUERY } from "../../constants";
import { DESIGN_PRIMITIVES_CSS } from "../../styles/design-css";
import { escapeHtml } from "../../utils/strings";
import { goldButton } from "../buttons/gold-button";
import type { LandingConfig, ShopItem } from "./landing-config";

/** The static landing's element in index.html; `<desktop-landing>` removes it when it takes over */
export const STATIC_LANDING_ID = "static-landing";
/** The attribute the inline decision sets on `<html>` for a desktop visitor (landing-decision-html.ts) */
export const LANDING_ATTRIBUTE = "data-osct-landing";

/** How many of the book's images drift over the hero */
export const SCATTER_COUNT = 14;

/**
 * Where the scattered images lie (#324): spots around the hero's edges, in % of its box, a size in rem and a turn – as
 * the book scatters its images over the white pages (title spread, back cover). The title, the text and the stage stay free.
 */
export const SCATTER: ReadonlyArray<{ x: number; y: number; size: number; turn: number }> = [
  { x: 20, y: 2, size: 5.5, turn: 3 }, { x: 36, y: 4, size: 5, turn: -2 }, { x: 52, y: 6, size: 6.5, turn: 4 },
  { x: 93, y: 4, size: 5.5, turn: -3 }, { x: -3, y: 40, size: 6.5, turn: -4 }, { x: 52, y: 52, size: 6.5, turn: -3 },
  { x: 56, y: 80, size: 5, turn: 2 }, { x: 94, y: 30, size: 7, turn: 3 }, { x: 93, y: 62, size: 6, turn: -2 },
  { x: 86, y: 90, size: 7.5, turn: -4 }, { x: 3, y: 90, size: 6, turn: 3 }, { x: 20, y: 91, size: 5, turn: -2 },
  { x: 38, y: 89, size: 6.5, turn: 2 }, { x: 64, y: 93, size: 5, turn: -5 },
];

/** A stable shuffle (the same images every visit of the same content): a seeded linear congruential generator */
export const pick = <T>(items: readonly T[], count: number, seed = 324): T[] => {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, count);
};

/** The texts of the `landing` i18n namespace, translated; `intro` with the title and the author filled in (escaped) */
export type LandingTexts = Record<
  | "label" | "intro" | "getApp" | "openOnPhone" | "shop" | "shopBook" | "shopShirt" | "toShop"
  | "previewAlt" | "scan" | "qrAlt" | "privacy",
  string
>;

export interface LandingSource extends LandingConfig {
  texts: LandingTexts;
  /** The experience's title, its book's author and publisher ("" without) */
  title: string;
  author: string;
  publisher: string;
  /** The experience's target images in scene order (URLs as the reader loads them); a stable pick of them is scattered */
  images: readonly string[];
  /** The footer's "Privacy & terms" (#353): the app's `/privacy` below the experience's path – the landing stays away there */
  privacyHref?: string;
}

/** The book's images of a game configuration as `getScenes()` lists its targets: scene order, switched-off targets left out */
export const landingImages = (
  config: { scenes?: ReadonlyArray<{ id: string }>; entries?: ReadonlyArray<{ scene: string; target?: { imageSrc?: string; enabled?: boolean } }> },
  url: (path: string) => string = path => path,
): string[] => {
  // As shared's isEntryInExperience (a test keeps them equal): importing shared/types here would load its whole tree into vite.config.js
  const entries = (config.entries ?? []).filter(entry => !entry.target || entry.target.enabled !== false);
  return [...new Set((config.scenes ?? []).flatMap(scene =>
    entries.filter(entry => entry.scene === scene.id && entry.target?.imageSrc).map(entry => url(entry.target!.imageSrc!))))];
};

const scatter = (images: readonly string[]): string =>
  pick([...new Set(images.filter(Boolean))], Math.min(SCATTER_COUNT, SCATTER.length))
    .map((src, i) => {
      const spot = SCATTER[i];
      const depth = (spot.size / 10).toFixed(2);
      return `<img class="float" src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"
          style="--x:${spot.x}%;--y:${spot.y}%;--size:${spot.size}rem;--turn:${spot.turn}deg;--depth:${depth};--delay:${(i * -1.7).toFixed(1)}s" />`;
    })
    .join("");

const shopItem = (item: ShopItem, texts: LandingTexts): string => {
  const name = item.id === "book" ? texts.shopBook : texts.shopShirt;
  return /* html */ `
      <li class="item" data-item="${item.id}">
        <div class="picture"><img src="${escapeHtml(item.image)}" alt="" /></div>
        <span class="name">${name}</span>
        ${goldButton({ label: texts.toShop, href: item.url, attrs: { "aria-label": `${name} – ${texts.toShop}` } })}
      </li>
    `;
};

/** The page's own styles (`:host` = `<desktop-landing>`, or the static landing's element) */
export const LANDING_CSS = /* css */ `
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
          overflow: hidden;               /* the scan stage's canvas fills the hero and ends at its line (#354) */
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

        /* The scan stage (#354): the book open, a phone scanning it – three.js draws into it once loaded (scan-stage.ts) */
        .stage {
          position: relative;
          width: clamp(24rem, 44vw, 46rem);
          aspect-ratio: 1;
          margin-inline-end: calc(-1 * var(--gutter) / 2);
          background: radial-gradient(closest-side, rgba(127, 96, 50, .22), transparent);
          cursor: pointer;                /* a click takes the phone (scan-stage.ts) */
        }

        /* Get the app: the QR code on a champagne card, the address – a computer neither enters nor installs the app (#354) */
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
        }
        .qr-code { aspect-ratio: 1; }
        .qr-code img, .qr-code canvas { display: block; width: 100% !important; height: auto !important; image-rendering: pixelated; }
        .qr-caption { margin: .875rem 0 0; color: #3b2a12; font-size: var(--text-size-small); text-align: center; letter-spacing: .08em; text-transform: uppercase; }
        h2 { margin: 0 0 1.25rem; font-weight: 400; font-size: clamp(2rem, 3.6vw, 3.25rem); line-height: 1.05; width: fit-content; }
        .lead { margin: 0 0 1.5rem; max-width: 34rem; font-size: 1.125rem; line-height: 1.55; }
        .address { display: inline-block; min-height: 1.5em; margin: 0 0 1.75rem; font-size: 1.5rem; user-select: all; }
        .small { font-size: var(--text-size-small); }

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
          .float { animation: none; transition: none; }
        }
        @media (${MEDIA_QUERY.TABLET}) {
          .hero-grid { grid-template-columns: minmax(0, 1fr); }
          .stage { justify-self: center; width: min(100%, 32rem); margin: 0; }
          .get-grid { grid-template-columns: minmax(0, 1fr); }
          .qr-card { justify-self: start; }
        }
`;

/**
 * The page: its styles and `<main>`. What needs the browser is filled in afterwards – the address (`.address`, the
 * page's host), the QR code (`.qr-code`), the book's cover.
 */
export const renderLanding = (source: LandingSource): string => {
  const { texts, title, author, publisher, shop, privacyHref = "/privacy" } = source;
  // The title as on the book's title page: its words on lines of their own, the "and" / "&" between them alone
  const titleLines = title.split(/\s+(&|and|und|et|en)\s+/i).map(part => escapeHtml(part));
  return /* html */ `
      <style>${LANDING_CSS}</style>
      <main class="landing design" aria-label="${texts.label}">
        <section class="hero">
          <div class="scatter" aria-hidden="true">${scatter(source.images)}</div>
          <div class="wrap hero-grid">
            <div class="intro-block">
              <h1>${titleLines.map((part, i) => `<span class="line gold shimmer${i % 2 ? " and" : ""}">${part}</span>`).join("")}</h1>
              ${author ? `<p class="author gold">${escapeHtml(author)}</p>` : ""}
              <p class="intro">${texts.intro}</p>
              <div class="actions">
                <a class="scroll-hint muted" href="#get">${texts.getApp} ↓</a>
              </div>
            </div>
            <aside class="stage" role="img" aria-label="${texts.previewAlt}"></aside>
          </div>
        </section>

        <section class="get" id="get">
          <div class="wrap">
            <div class="get-grid">
              <figure class="qr-card" style="margin:0">
                <div class="qr-code" role="img" aria-label="${texts.qrAlt}"></div>
                <figcaption class="qr-caption">${texts.scan}</figcaption>
              </figure>
              <div>
                <h2 class="gold">${texts.getApp}</h2>
                <p class="lead">${texts.openOnPhone}</p>
                <span class="address gold"></span>
              </div>
            </div>
          </div>
        </section>

        <section class="shop-section">
          <div class="wrap">
            <h2 class="gold">${texts.shop}</h2>
            <ul class="shop">${shop.map(item => shopItem(item, texts)).join("")}</ul>
          </div>
        </section>

        <footer>
          <div class="wrap muted small">
            <span>${escapeHtml(title)}${author ? ` · ${escapeHtml(author)}` : ""}</span>
            <span>${publisher ? `${escapeHtml(publisher)} · ` : ""}<a href="${escapeHtml(privacyHref)}">${texts.privacy}</a></span>
          </div>
        </footer>
      </main>
    `;
};

/** i18next's interpolation for the build: `{{title}}`, `{{author}}`, the values escaped (as `t()` does) */
export const fillTexts = (raw: Record<string, string>, values: Record<string, string>): LandingTexts =>
  Object.fromEntries(Object.entries(raw).map(([key, text]) =>
    [key, text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => escapeHtml(values[name] ?? ""))])) as LandingTexts;

/**
 * The static landing for index.html (#343): the same page in a declarative shadow root (`<template shadowrootmode>`),
 * with the design primitives' CSS, shown only while `<html>` carries `data-osct-landing` (the inline decision in the
 * head) – then the static splash makes way. A small script after it writes the address before the bundle has loaded.
 * The page tokens (main.css) and the font (`@font-face` in the head) are loaded before first paint already.
 */
export const renderStaticLanding = (source: LandingSource): string => [
  `<style>`,
  `#${STATIC_LANDING_ID}{position:fixed;inset:0;z-index:10000;overflow:auto;background:#000}`,
  `html:not([${LANDING_ATTRIBUTE}]) #${STATIC_LANDING_ID}{display:none}`,
  `html[${LANDING_ATTRIBUTE}] #static-splash{display:none}`,
  `</style>`,
  `<div id="${STATIC_LANDING_ID}"><template shadowrootmode="open"><style>${DESIGN_PRIMITIVES_CSS}</style>${renderLanding(source)}</template></div>`,
  `<script>(function () { try {`,
  ` var host = document.getElementById(${JSON.stringify(STATIC_LANDING_ID)}); var root = host && host.shadowRoot; if (!root) return;`,
  ` var address = root.querySelector(".address"); if (address) address.textContent = location.host;`,
  `} catch (e) {} })();</script>`,
].join("");
