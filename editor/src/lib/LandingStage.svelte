<script lang="ts" module>
  import tokens from "@ui/brand/tokens.css?inline";
  import { fontBaseUrl, fontFaceRules } from "@ui/brand/font-face";

  /**
   * The brand's tokens on the piece's shadow host, never on the editor's document (RULES #38: the editor stays
   * monochrome), and what the reader's document gives its body: the brand's type, set dark
   */
  export const brandHostStyles = (css: string): string =>
    css.replaceAll(":root", ":host") +
    ":host { font-family: var(--font-design); font-weight: 400; line-height: 1.5; color-scheme: dark; -webkit-font-smoothing: antialiased; }";
  /** The stage's own mark on the page: the text whose field has the focus (the editor's, monochrome – RULES #38) */
  const EDITING_STYLES = "[data-editing] { outline: 2px dashed #e0e0e0; outline-offset: .375rem; }";
  const LANDING_HOST_STYLES = brandHostStyles(tokens) + EDITING_STYLES;

  const FONT_STYLE_ID = "osct-brand-font";

  /**
   * The brand's typeface declared on the document once (fonts are the document's, not a shadow root's): a family name
   * only the piece's `--font-design` asks for, so the editor's own type is untouched
   */
  export const declareBrandFont = (doc: Document = document): void => {
    if (doc.getElementById(FONT_STYLE_ID)) return;
    const rules = fontFaceRules(fontBaseUrl(import.meta.env.VITE_FONT_BASE_URL));
    if (!rules) return;
    const style = doc.createElement("style");
    style.id = FONT_STYLE_ID;
    style.textContent = rules;
    doc.head.appendChild(style);
  };
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import type { LandingData } from "@ui/landing/data";
  import { mountLanding, type LandingInput, type LandingView } from "@ui/landing/mount";
  import { landingTexts, type LandingLanguage } from "@ui/landing/texts";
  import { landingQrUrlOf, privacyHrefOf } from "@ui/landing/links";
  import { pluginGuard } from "#lib/plugin-guard.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { session } from "#lib/session.svelte.js";

  /**
   * The landing workspace's stage (#356): the reader's landing page itself (`ui/landing`, the piece the reader mounts on a
   * computer) with the experience's draft – what a computer gets once it is published: the title, the hero, the QR card,
   * the shop and the footer, in `language` (the Texts section's, #365), scrolled inside the stage (`contained`). The
   * brand's tokens sit on its shadow host (`LANDING_HOST_STYLES`), the brand's font faces on the document. A new hero
   * (the pick changed, a save, a revert) mounts the page again; new texts, a new shop or another language only update it
   * (`LandingView.update`) – the hero runs on while the person types. `highlight` marks one of the texts on the page (the
   * text field in focus) and scrolls it into view. The hero runs the experience's plugins in this page like the scene's
   * stage, so it goes through the same guard (RULES #35): plugins kept off are left out of the hero.
   */
  let { experienceId, data, language = "en", highlight = null }: {
    experienceId: string;
    /** The page's data from the draft (`loadDraftLanding`, `landingDataOf`); null while it is read */
    data: LandingData | null;
    /** The language the page shows */
    language?: LandingLanguage;
    /** A text whose place the page marks: `intro`, `getApp`, `openOnPhone`, `shop` */
    highlight?: string | null;
  } = $props();

  let host = $state<HTMLDivElement>();
  /** The view mounted now and the hero it runs (by value: a new data object with the same hero only updates) */
  let view: LandingView | null = null;
  let heroKey = "";
  /** Counts the mounts: a hero the guard let run late mounts only while no newer mount (or leaving) came */
  let mounts = 0;
  /** Bumped after every render: the highlight is set again */
  let rendered = $state(0);

  /** The hero's plugins the person lets run (others' code only after the prompt – #35) */
  const allowedHero = async (shown: LandingData): Promise<LandingData> => {
    const hero = shown.hero;
    if (!hero?.plugins.length) return shown;
    if (plugins.experienceId !== experienceId) await plugins.load(experienceId).catch(() => undefined);
    const declined = await pluginGuard.check(experienceId, plugins.stored, hero.plugins.map(p => ({ id: p.id, src: p.src })), session.user?.email ?? null);
    return declined.size ? { ...shown, hero: { ...hero, plugins: hero.plugins.filter(p => !declined.has(p.id)) } } : shown;
  };

  /** What the hero is made of: a change of it mounts the page again */
  const heroKeyOf = (page: LandingData): string =>
    JSON.stringify({ experience: page.experience, hero: page.hero, images: page.images, cover: page.cover });

  const inputOf = (page: LandingData, lang: LandingLanguage): LandingInput => {
    const prefix = `/${encodeURIComponent(page.experience)}`;
    return {
      data: page,
      texts: landingTexts(lang, { title: page.title, author: page.author }, page.texts),
      qrUrl: landingQrUrlOf(location.origin, prefix),
      address: location.host,
      privacyHref: privacyHrefOf(prefix),
    };
  };

  $effect(() => {
    const el = host;
    const shown = data;
    const lang = language;
    if (!el || !shown) return;
    const key = heroKeyOf(shown);
    untrack(() => {
      if (view && key === heroKey) {
        view.update(inputOf(shown, lang));
        rendered += 1;
      }
    });
  });

  $effect(() => {
    const el = host;
    const shown = data;
    if (!el || !shown) return;
    const key = heroKeyOf(shown);
    if (view && key === heroKey) return;
    declareBrandFont();
    const token = ++mounts;
    heroKey = key;
    const mount = (page: LandingData) => {
      view?.stop();
      view = mountLanding(el, inputOf(page, untrack(() => language)), { contained: true, styles: LANDING_HOST_STYLES });
      rendered += 1;
    };
    untrack(() => {
      // The page at once; a hero with plugins once the guard has answered (the same render: the markup stays)
      const asks = !!shown.hero?.plugins.length;
      mount(asks ? { ...shown, hero: null } : shown);
      if (asks) void allowedHero(shown).then(allowed => { if (token === mounts) mount({ ...allowed, ...latestTexts() }); });
    });
  });
  $effect(() => () => {
    mounts += 1;
    view?.stop();
    view = null;
    heroKey = "";
  });
  /** The texts and shop shown now (they may have changed while the guard asked) */
  const latestTexts = (): Partial<LandingData> => (data ? { title: data.title, shop: data.shop, texts: data.texts } : {});

  /** Where each text the person may write shows on the page */
  const PLACES: Record<string, string> = { intro: ".intro", getApp: ".scroll-hint, .get h2", openOnPhone: ".get .lead", shop: ".shop-section h2" };
  $effect(() => {
    void rendered;
    const el = host;
    const mark = highlight;
    const root = el?.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-editing]").forEach(node => node.removeAttribute("data-editing"));
    const places = mark && PLACES[mark] ? [...root.querySelectorAll<HTMLElement>(PLACES[mark])] : [];
    places.forEach(node => node.setAttribute("data-editing", ""));
    places[0]?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  });
  // Leaving the workspace while the guard asks: nothing runs
  $effect(() => () => pluginGuard.dismiss());
</script>

<div class="landing-stage" bind:this={host} data-landing-stage></div>

<style>
  /* The piece's host: the stage's box; the page scrolls inside it (`contained`) */
  .landing-stage { position: absolute; inset: 0; }
</style>
