/**
 * <gold-illustration src="/assets/illustrations/….svg" label="Camera">
 *
 * Shows a (black line art) SVG in gold "chrome" with a sweeping highlight, like a skeleton loader
 * (DESIGN.md §5, option F). The SVG stays a file in `public/` (swappable content); on load its dark
 * shapes get the gold chrome gradient, white shapes become transparent (cut-outs on the dark UI), and
 * a copy on top carries the moving highlight. No sweep with `prefers-reduced-motion`.
 * Gradient stops come from the gold tokens (`--gold-1…4`, main.css).
 */

const cache = new Map<string, Promise<string>>();
const load = (src: string): Promise<string> => {
  if (!cache.has(src)) {
    cache.set(src, fetch(src).then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${src}`)))));
  }
  return cache.get(src)!;
};

const SHAPES = "path, rect, circle, ellipse, polygon, polyline, line, text, use";
let counter = 0;

/** Paint color of a shape (style attribute wins over the presentation attribute) */
const paint = (el: Element, prop: "fill" | "stroke"): string | null => {
  const style = el.getAttribute("style") ?? "";
  const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(style);
  return (match?.[1] ?? el.getAttribute(prop))?.trim() ?? null;
};
const isWhite = (color: string | null) => !!color && /^(#fff(fff)?|white|rgb\(\s*255,\s*255,\s*255\s*\))$/i.test(color);
const isNone = (color: string | null) => !!color && /^(none|transparent)$/i.test(color);

/**
 * Effective paint: own value or inherited from an ancestor (Penpot exports put `fill="none"` on the root
 * <svg>, so unfilled frames stay invisible); without any value SVG's default applies (fill black,
 * stroke none).
 */
const effectivePaint = (el: Element, prop: "fill" | "stroke"): string => {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const color = paint(node, prop);
    if (color && color !== "inherit") return color;
  }
  return prop === "fill" ? "#000" : "none";
};

export class GoldIllustration extends HTMLElement {
  static get observedAttributes() {
    return ["src", "label"];
  }

  private gradientId = `gold-${++counter}`;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue !== newValue && this.isConnected) this.render();
  }

  private async render() {
    const src = this.getAttribute("src");
    if (!this.shadowRoot || !src) return;
    let text: string;
    try {
      text = await load(src);
    } catch (error) {
      console.warn("[GoldIllustration]", error);
      this.shadowRoot.innerHTML = "";
      return;
    }
    if (this.getAttribute("src") !== src) return; // changed while loading
    this.shadowRoot.innerHTML = this.goldSvg(text);
  }

  private goldSvg(source: string): string {
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return "";

    const width = parseFloat(svg.getAttribute("width") ?? "100");
    const height = parseFloat(svg.getAttribute("height") ?? "100");
    const viewBox = svg.getAttribute("viewBox") ?? `0 0 ${width} ${height}`;
    const [x, , w] = viewBox.split(/[\s,]+/).map(Number);
    const chrome = `url(#${this.gradientId}-chrome)`;
    const sweep = `url(#${this.gradientId}-sweep)`;

    // Dark shapes → gold chrome, white → transparent (cut-outs), keep "none"
    // Resolve first, then write – writing while resolving would change what descendants inherit
    const shapes = Array.from(svg.querySelectorAll(SHAPES));
    const resolved = shapes.map(el => (["fill", "stroke"] as const).map(prop => {
      const color = effectivePaint(el, prop);
      return isNone(color) || isWhite(color) ? "none" : chrome;
    }));
    shapes.forEach((el, i) => {
      (["fill", "stroke"] as const).forEach((prop, k) => {
        el.setAttribute(prop, resolved[i][k]);
        (el as SVGElement).style?.removeProperty(prop);
      });
    });
    // Embedded font imports etc. (Penpot text exports) are not needed for line art
    svg.querySelectorAll("style").forEach(style => style.remove());
    const art = svg.innerHTML;
    // Highlight copy: same geometry, sweep gradient instead of chrome
    const highlight = art.split(chrome).join(sweep);

    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = (offset: number, token: string, opacity = 1) =>
      `<stop offset="${offset}" style="stop-color: var(${token}); stop-opacity: ${opacity}"/>`;
    const label = this.getAttribute("label");

    return /* html */ `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg { width: 100%; height: auto; overflow: visible; }
      </style>
      <svg viewBox="${viewBox}" ${label ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"` : 'aria-hidden="true"'}>
        <defs>
          <linearGradient id="${this.gradientId}-chrome" x1="0" y1="0" x2="0.35" y2="1">
            ${stop(0, "--gold-4")}${stop(0.35, "--gold-2")}${stop(0.55, "--gold-1")}${stop(0.8, "--gold-2")}${stop(1, "--gold-3")}
          </linearGradient>
          <linearGradient id="${this.gradientId}-sweep" gradientUnits="userSpaceOnUse" x1="${x}" y1="0" x2="${x + w}" y2="0" gradientTransform="translate(-${w} 0)">
            ${stop(0.35, "--gold-1", 0)}${stop(0.5, "--gold-1", 0.9)}${stop(0.65, "--gold-1", 0)}
            ${reduceMotion ? "" : `<animateTransform attributeName="gradientTransform" type="translate" from="-${w} 0" to="${w} 0" dur="1.8s" repeatCount="indefinite"/>`}
          </linearGradient>
        </defs>
        <g>${art}</g>
        <g>${highlight}</g>
      </svg>
    `;
  }
}

customElements.define("gold-illustration", GoldIllustration);
