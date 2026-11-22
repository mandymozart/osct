/**
 * Shared design primitives (spec: agents/DESIGN.md §7). Tokens live in `main.css` (:root); components keep
 * only their layout. `adoptDesignStyles()` adopts one shared CSSStyleSheet into each shadow root, so it
 * survives `innerHTML` re-renders.
 *
 * Primitives:
 *   .design         design font, tracking, size and line height
 *   .gold           gold gradient text (per element, left to right; DESIGN.md §5)
 *   .shimmer        modifier for .gold: a slow light band sweeps through the gold (#280) – the experience's title, "New
 *                   marginalia unlocked"; not for body text. Off with reduced motion
 *   .muted          muted grey text
 *   .button         onboarding button: glass body (transparent), white glow, gold label (<span class="gold">)
 *   .pill           glass pill: transparent, backdrop blur, grey shadow, gold label; the active item glows gold
 *                   (bronze, set by the component – #297)
 *   .icon-button    round glass button ("i")
 *                   Buttons have no fill and never a border, only a drop shadow (Tilman, #297)
 *   .switch         on/off switch (checkbox role="switch"), knob gold when on;
 *                   .switch-row is the surrounding label row (text left, switch right)
 *   .field          text input: glass pill with a muted rule, gold focus border
 *   .text-link      secondary action as underlined muted text (a native <button>), e.g. next to a pill
 *   .primary        modifier for .button / .pill: animated label shine; absent = secondary
 *   .rule-table     meta table with 1 px rules, muted labels, white values
 *   .section-title  muted title between two rules
 *   .gold-spinner   gold loader ring (from styles/gold-spinner.css, shared with the startup loader)
 *
 * Token variants (debugging looks like debugging, brand UI only in reader-facing elements – RULES #32):
 * **branded** = the reader's UI, the tokens of main.css (the default, no attribute); **debug** = the dev tools' green
 * terminal. A host sets `data-theme="debug"` on itself; the tokens cascade into its shadow tree and every primitive
 * inside follows – one set of components, two looks. (The editor's neutral day/night palette lives in the editor app.)
 */
import goldSpinnerCss from "./gold-spinner.css?inline";
import { DESIGN_PRIMITIVES_CSS } from "./design-css";

export const DESIGN_CSS = goldSpinnerCss + DESIGN_PRIMITIVES_CSS;

let sheet: CSSStyleSheet | null = null;

const supported = (): boolean => {
  try {
    return typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype
      && typeof ShadowRoot !== "undefined" && "adoptedStyleSheets" in ShadowRoot.prototype;
  } catch {
    return false;
  }
};

/** Add the shared design stylesheet to a shadow root (once per root) */
export const adoptDesignStyles = (root: ShadowRoot | null | undefined): void => {
  if (!root || !supported()) return;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(DESIGN_CSS);
  }
  if (!root.adoptedStyleSheets.includes(sheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  }
};
