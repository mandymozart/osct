/**
 * The design primitives' CSS (styles/design-styles.ts lists them) without imports, so the build can write it into
 * index.html too: the desktop landing's static first paint (#343, landing/landing-html.ts) uses the
 * same rules as the components. `DESIGN_CSS` = the gold spinner + this.
 */
export const DESIGN_PRIMITIVES_CSS = /* css */ `
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
    --gold-shimmer: linear-gradient(transparent, transparent);
    --glass-background: rgba(0, 0, 0, .4);
    --glass-blur: none;
    --shadow-bronze: none;
    --shadow-grey: none;
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
    text-decoration: none;            /* goldButton({ href }) renders an <a> */
  }

  .button {
    min-width: 9.5rem;
    min-height: 1.95rem;
    padding: 0 1.5rem;
    border-radius: 999rem;
    background: var(--glass-background);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--shadow-glow);
  }
  .button:not(.primary) { box-shadow: var(--shadow-glow-soft); }

  .pill,
  .icon-button {
    background: var(--glass-background);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--shadow-grey);
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

  /* Shimmer and shine: the light band (--gold-shimmer) over the gold, moved with background-position only –
     no layout, no JS (cheap on phones). Gold text: slow, with a pause between sweeps; primary labels: constant */
  .gold.shimmer,
  .primary .gold {
    background-image: var(--gold-shimmer), var(--gold-gradient);
    background-size: 300% 100%, 100% 100%;
    background-repeat: no-repeat;
  }
  .gold.shimmer { animation: gold-shimmer var(--shimmer-duration) ease-in-out infinite; }
  @keyframes gold-shimmer {
    0% { background-position: 150% 0, 0 0; }
    60%, 100% { background-position: -50% 0, 0 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .gold.shimmer { animation: none; background-image: var(--gold-gradient); }
  }

  .primary .gold { animation: gold-shine var(--shine-duration) linear infinite; }
  @keyframes gold-shine {
    from { background-position: 150% 0, 0 0; }
    to { background-position: -50% 0, 0 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .primary .gold { animation: none; }
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
