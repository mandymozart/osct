/**
 * Shared design primitives (design 260804, measured spec: agents/DESIGN.md §7).
 *
 * One stylesheet for every design component: tokens live in `main.css` (:root), the primitives here,
 * components keep only their layout. Adopted into shadow roots with `adoptDesignStyles()` – one
 * CSSStyleSheet instance for all of them (survives `innerHTML` re-renders).
 *
 * Primitives:
 *   .design      font, tracking, size, line height of the design
 *   .gold        gold gradient text (DESIGN.md §5, option A: per element, left → right)
 *   .muted       grey #8b8d8c
 *   .button      onboarding button: black body, white glow, gold label (<span class="gold">)
 *   .pill        glass pill: almost transparent + backdrop blur + dark drop shadow, gold label
 *   .icon-button round glass button ("i")
 *   .rule-table  consultation meta table (1 px rules, muted labels, white values, 24 px rows)
 *   .section-title  muted title between two rules ("Info", "Colophon")
 */
export const DESIGN_CSS = /* css */ `
  .design {
    font-family: var(--font-design);
    letter-spacing: var(--tracking-design);
    font-size: var(--text-size);
    line-height: var(--text-line);
  }

  .gold {
    background-image: var(--gold-gradient);
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }
  /* Children show the parent's gradient (e.g. one gradient across the whole entries list) */
  .gold :where(*) {
    color: inherit;
    -webkit-text-fill-color: inherit;
  }

  .muted { color: var(--color-muted); }

  .button,
  .pill,
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    font: inherit;
    letter-spacing: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .button {
    min-width: 9.5rem;              /* 79 pt ≈ 151 px */
    min-height: 1.95rem;            /* 16 pt ≈ 31 px */
    padding: 0 1.5rem;
    border-radius: 999px;
    background: #000;
    box-shadow: var(--shadow-glow);
  }

  .pill,
  .icon-button {
    background: var(--glass-background);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--shadow-dark);
  }
  .pill {
    min-height: 1.8rem;             /* 15 pt ≈ 29 px */
    padding: 0 1rem;
    border-radius: 999px;
  }
  .icon-button {
    width: 2.15rem;                 /* Ø 17.9 pt ≈ 34 px */
    height: 2.15rem;
    border-radius: 50%;
  }
  .button:active,
  .pill:active,
  .icon-button:active { transform: scale(.97); }
  .button:disabled { opacity: .6; cursor: wait; }

  .rule-table {
    width: 100%;
    border-collapse: collapse;
  }
  .rule-table th,
  .rule-table td {
    height: var(--row-height);
    padding: 0;
    text-align: left;
    font-weight: 400;
    vertical-align: middle;
    border-top: var(--rule);
    border-bottom: var(--rule);
  }
  .rule-table th { color: var(--color-muted); width: 40%; }
  .rule-table td { color: var(--color-on-dark); overflow-wrap: anywhere; }

  .section-title {
    margin: 1.5rem 0 1rem;
    height: var(--row-height);
    display: flex;
    align-items: center;
    font-size: inherit;
    font-weight: 400;
    color: var(--color-muted);
    border-top: var(--rule);
    border-bottom: var(--rule);
  }
`;

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
