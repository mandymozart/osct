/**
 * Colour maths for the colour popover (after Scutoons' `@scutoons/ui` colour.ts): hex ⟷ HSV, the editor's palette,
 * this browser's recent colours. No Svelte.
 */

export const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` → `#aabbcc`, lower case */
export const longHex = (c: string): string => (c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c).toLowerCase();

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

export const hexToHsv = (hex: string): Hsv => {
  const n = parseInt(longHex(hex).slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
};

export const hsvToHex = ({ h, s, v }: Hsv): string => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map(x => x.toString(16).padStart(2, "0")).join("")}`;
};

/**
 * The palette offered first: the keys a chroma key usually meets (green and blue screen, white, black) and the
 * book's own gold (the reader's design, `agents/DESIGN.md`).
 */
export const PALETTE: { name: string; hex: string }[] = [
  { name: "green screen", hex: "#00ff00" },
  { name: "chroma green", hex: "#00b140" },
  { name: "blue screen", hex: "#0000ff" },
  { name: "chroma blue", hex: "#0047bb" },
  { name: "white", hex: "#ffffff" },
  { name: "black", hex: "#000000" },
  { name: "gold", hex: "#f3cc94" },
  { name: "gold deep", hex: "#b8860b" },
  { name: "red", hex: "#ff0000" },
  { name: "magenta", hex: "#ff00ff" },
];

const RECENT_KEY = "osct-editor-recent-colours";
const RECENT_MAX = 8;

/** This browser's last picked colours, newest first */
export const recentColours = (): string[] => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(c => typeof c === "string" && HEX.test(c)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
};

export const rememberColour = (hex: string): void => {
  if (!HEX.test(hex)) return;
  const c = longHex(hex);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...recentColours().filter(x => x !== c)].slice(0, RECENT_MAX)));
  } catch {
    // not remembered – fine
  }
};
