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
  const LANDING_HOST_STYLES = brandHostStyles(tokens);

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
  import { mountLanding, type LandingView } from "@ui/landing/mount";
  import { landingTexts } from "@ui/landing/texts";
  import { landingQrUrlOf, privacyHrefOf } from "@ui/landing/links";
  import { pluginGuard } from "#lib/plugin-guard.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { session } from "#lib/session.svelte.js";

  /**
   * The landing workspace's stage (#356): the reader's landing page itself (`ui/landing`, the piece the reader mounts on a
   * computer) with the experience's draft – what a computer gets once it is published: the title, the hero, the QR card,
   * the shop and the footer, in English, scrolled inside the stage (`contained`). The brand's tokens sit on its shadow
   * host (`LANDING_HOST_STYLES`), the brand's font faces on the document. A new `data` (the pick changed, a save, a revert)
   * mounts the page again. The hero runs the experience's plugins in this page like the scene's stage, so it goes through
   * the same guard (RULES #35): plugins kept off are left out of the hero.
   */
  let { experienceId, data }: {
    experienceId: string;
    /** The page's data from the draft (`loadDraftLanding`); null while it is read */
    data: LandingData | null;
  } = $props();

  let host = $state<HTMLDivElement>();

  /** The hero's plugins the person lets run (others' code only after the prompt – #35) */
  const allowedHero = async (shown: LandingData): Promise<LandingData> => {
    const hero = shown.hero;
    if (!hero?.plugins.length) return shown;
    if (plugins.experienceId !== experienceId) await plugins.load(experienceId).catch(() => undefined);
    const declined = await pluginGuard.check(experienceId, plugins.stored, hero.plugins.map(p => ({ id: p.id, src: p.src })), session.user?.email ?? null);
    return declined.size ? { ...shown, hero: { ...hero, plugins: hero.plugins.filter(p => !declined.has(p.id)) } } : shown;
  };

  $effect(() => {
    const el = host;
    const shown = data;
    if (!el || !shown) return;
    declareBrandFont();
    let view: LandingView | null = null;
    let gone = false;
    const prefix = `/${encodeURIComponent(shown.experience)}`;
    const mount = (page: LandingData) => {
      view?.stop();
      view = mountLanding(el, {
        data: page,
        texts: landingTexts("en", { title: page.title, author: page.author }),
        qrUrl: landingQrUrlOf(location.origin, prefix),
        address: location.host,
        privacyHref: privacyHrefOf(prefix),
      }, { contained: true, styles: LANDING_HOST_STYLES });
    };
    untrack(() => {
      // The page at once; a hero with plugins once the guard has answered (the same render: the markup stays)
      const asks = !!shown.hero?.plugins.length;
      mount(asks ? { ...shown, hero: null } : shown);
      if (asks) void allowedHero(shown).then(allowed => { if (!gone) mount(allowed); });
    });
    return () => {
      gone = true;
      view?.stop();
    };
  });
  // Leaving the workspace while the guard asks: nothing runs
  $effect(() => () => pluginGuard.dismiss());
</script>

<div class="landing-stage" bind:this={host} data-landing-stage></div>

<style>
  /* The piece's host: the stage's box; the page scrolls inside it (`contained`) */
  .landing-stage { position: absolute; inset: 0; }
</style>
