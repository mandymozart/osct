/**
 * Shared design primitives (spec: agents/DESIGN.md §7). Tokens live in `main.css` (:root); components keep
 * only their layout. `adoptDesignStyles()` adopts one shared CSSStyleSheet into each shadow root, so it
 * survives `innerHTML` re-renders.
 *
 * Primitives:
 *   .design         design font, tracking, size and line height
 *   .gold           gold gradient text (per element, left to right; DESIGN.md §5)
 *   .muted          muted grey text
 *   .button         onboarding button: black body, white glow, gold label (<span class="gold">)
 *   .pill           glass pill: near-transparent, backdrop blur, bronze glow, gold label
 *   .icon-button    round glass button ("i")
 *   .switch         on/off switch (checkbox role="switch"), knob gold when on;
 *                   .switch-row is the surrounding label row (text left, switch right)
 *   .field          text input: glass pill with a muted rule, gold focus border
 *   .text-link      secondary action as underlined muted text (a native <button>), e.g. next to a pill
 *   .primary        modifier for .button / .pill: animated label shine and border sweep; absent = secondary
 *   .rule-table     meta table with 1 px rules, muted labels, white values
 *   .section-title  muted title between two rules
 *   .gold-spinner   gold loader ring (from styles/gold-spinner.css, shared with the startup loader)
 *
 * Token variants (Tilman, 2026-10-29: "debugging looks like debugging, the editor neutral like Figma, brand UI only in
 * reader-facing elements"): **branded** = the reader's UI, the tokens of main.css (the default, no attribute);
 * **editor** = a neutral tool in a design tool's default colours, day and night (follows the system; `data-scheme` on
 * the host forces one), no colour, square corners, compact system type; **debug** = the dev
 * tools' green terminal. A host sets `data-theme="editor"` / `"debug"` on itself; the tokens cascade into its shadow
 * tree and every primitive inside follows – one set of components, three looks.
 */
import goldSpinnerCss from "./gold-spinner.css?inline";

export const DESIGN_CSS = goldSpinnerCss + /* css */ `
  /* editor – the palette of a design tool's defaults: day (white, light greys, near-black text) and night (dark greys,
     white text); no colour at all – focus and accents in the text colour, pressed segments in grey. The night values follow
     the system; data-scheme="light" / "dark" on the host forces one. */
  :host([data-theme="editor"]) {
    --font-design: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --tracking-design: 0;
    --text-size: .75rem;
    --text-size-small: .6875rem;
    --text-line: 1.3;
    --glass-blur: none;
    --shadow-bronze: none;
    --control-height: 1.75rem;
    --control-radius: .25rem;
    --color-on-dark: #1e1e1e;
    --color-muted: #7f7f7f;
    --color-accent: #1e1e1e;
    --rule: .0625rem solid #e6e6e6;
    --gold-gradient: linear-gradient(90deg, #1e1e1e, #1e1e1e);
    --glass-background: #f5f5f5;
    --pressed-background: #e0e0e0;
    --pressed-color: #1e1e1e;
    --hover-background: #ebebeb;
    --surface: #ffffff;
    --surface-head: #f5f5f5;
    --line: #e6e6e6;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :host([data-theme="editor"]:not([data-scheme="light"])) {
      --color-on-dark: #ffffff;
      --color-muted: #a3a3a3;
      --color-accent: #ffffff;
      --rule: .0625rem solid #444444;
      --gold-gradient: linear-gradient(90deg, #ffffff, #ffffff);
      --glass-background: #383838;
      --pressed-background: #4f4f4f;
      --pressed-color: #ffffff;
      --hover-background: #3f3f3f;
      --surface: #2c2c2c;
      --surface-head: #1e1e1e;
      --line: #444444;
      color-scheme: dark;
    }
  }
  :host([data-theme="editor"][data-scheme="dark"]) {
    --color-on-dark: #ffffff;
    --color-muted: #a3a3a3;
    --color-accent: #ffffff;
    --rule: .0625rem solid #444444;
    --gold-gradient: linear-gradient(90deg, #ffffff, #ffffff);
    --glass-background: #383838;
    --pressed-background: #4f4f4f;
    --pressed-color: #ffffff;
    --hover-background: #3f3f3f;
    --surface: #2c2c2c;
    --surface-head: #1e1e1e;
    --line: #444444;
    color-scheme: dark;
  }
  :host([data-theme="debug"]) {
    --font-design: monospace;
    --tracking-design: 0;
    --text-size: .75rem;
    --text-size-small: .6875rem;
    --text-line: 1.25rem;
    --color-on-dark: #0f0;
    --color-muted: #9c9;
    --color-accent: #0f0;
    --rule: .0625rem solid #0f0;
    --gold-gradient: linear-gradient(90deg, #0f0, #0f0);
    --glass-background: rgba(0, 0, 0, .4);
    --glass-blur: none;
    --shadow-bronze: none;
    --control-height: 1.5rem;
    --control-radius: .25rem;
    --pressed-background: #0f0;
    --pressed-color: #000;
    --hover-background: rgba(0, 255, 0, .15);
    --surface: rgba(0, 0, 0, .85);
    --surface-head: rgba(0, 0, 0, .85);
    --line: #0f0;
  }

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
  /* Descendants inherit the parent's gradient instead of starting their own. */
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
    min-width: 9.5rem;
    min-height: 1.95rem;
    padding: 0 1.5rem;
    border-radius: 999rem;
    background: #000;
    box-shadow: var(--shadow-glow);
  }
  .button:not(.primary) { box-shadow: var(--shadow-glow-soft); }

  .pill,
  .icon-button {
    background: var(--glass-background);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--shadow-bronze);
  }
  .pill {
    min-height: 1.8rem;
    padding: 0 1rem;
    border-radius: 999rem;
  }
  .icon-button {
    width: 2.15rem;
    height: 2.15rem;
    border-radius: 50%;
  }
  .field {
    min-height: 1.8rem;
    min-width: 0;
    padding: 0 1rem;
    border: var(--rule);
    border-radius: 999rem;
    font: inherit;
    letter-spacing: inherit;
    color: var(--color-on-dark);
    background: var(--glass-background);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
  }
  .field::placeholder { color: var(--color-muted); }
  .field:focus-visible { outline: none; border-color: var(--color-accent); }
  .field:disabled { opacity: .6; }

  .text-link {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    letter-spacing: inherit;
    color: var(--color-muted);
    text-decoration: underline;
    text-underline-offset: .2em;
    cursor: pointer;
  }
  .text-link:hover { color: var(--color-on-dark); }
  .text-link:focus-visible { outline: .125rem solid var(--color-accent); outline-offset: .125rem; }
  .text-link:disabled { opacity: .6; cursor: wait; }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .75rem;
    box-sizing: border-box;
    min-height: 4rem;
    padding: .5rem 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .switch {
    -webkit-appearance: none;
    appearance: none;
    flex: none;
    position: relative;
    width: 2.75rem;
    height: 1.5rem;
    margin: 0;
    border: var(--rule);
    border-radius: 999rem;
    background: var(--glass-background);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--shadow-bronze);
    cursor: pointer;
    transition: border-color .2s;
  }
  .switch::before {
    content: "";
    position: absolute;
    top: 50%;
    left: .1875rem;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--color-muted);
    transform: translateY(-50%);
    transition: transform .2s, background .2s;
  }
  .switch:checked { border-color: var(--color-accent); }
  .switch:checked::before {
    background: var(--gold-gradient);
    box-shadow: var(--shadow-glow-soft);
    transform: translate(1.25rem, -50%);
  }
  .switch:focus-visible { outline: .125rem solid var(--color-accent); outline-offset: .125rem; }
  .switch:disabled { opacity: .6; cursor: wait; }
  @media (prefers-reduced-motion: reduce) {
    .switch,
    .switch::before { transition: none; }
  }

  .button:active,
  .pill:active,
  .icon-button:active { transform: scale(.97); }

  .primary { position: relative; isolation: isolate; }
  .primary .gold {
    background-image:
      linear-gradient(110deg, transparent 40%, var(--gold-1) 50%, transparent 60%),
      var(--gold-gradient);
    background-size: 300% 100%, 100% 100%;
    animation: gold-shine 1.8s linear infinite;
  }
  .primary::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    padding: 0.0625rem;              /* ring width of the masked border sweep */
    border-radius: inherit;
    background:
      linear-gradient(110deg, transparent 35%, var(--gold-1) 48%, var(--gold-3) 52%, transparent 65%)
      0 0 / 300% 100% no-repeat,
      linear-gradient(90deg, rgba(210, 174, 90, .25), rgba(210, 174, 90, .25));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
    animation: gold-shine 1.8s linear infinite;
    pointer-events: none;
  }
  @keyframes gold-shine {
    from { background-position: 150% 0, 0 0; }
    to { background-position: -50% 0, 0 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .primary .gold,
    .primary::before { animation: none; }
  }
  .button:disabled,
  .pill:disabled { opacity: .6; cursor: wait; }

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
