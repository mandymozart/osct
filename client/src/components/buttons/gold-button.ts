import { escapeHtml } from "@/utils";

/**
 * Markup helper for the design buttons (DESIGN.md §7). Deliberately not a custom element: the result is a
 * native `<button>` in the calling component's shadow root, so event delegation, `hidden`, `aria-*` and
 * per-component styles keep working. The component must call `adoptDesignStyles` for the look.
 *
 *   button  – onboarding button: black body, white glow
 *   pill    – glass pill (default)
 *   icon    – round glass button; needs an `aria-label`
 *   primary – shining label and border sweep; otherwise secondary
 */
export type GoldButtonShape = "button" | "pill" | "icon";

export interface GoldButtonOptions {
  /** Plain text – escaped here */
  label: string;
  shape?: GoldButtonShape;
  primary?: boolean;
  /** `submit` inside a form (default `button`) */
  type?: "button" | "submit";
  /** Extra classes for the component's own styles */
  className?: string;
  /** Attributes: `true` = present without value, `false` / `undefined` = left out */
  attrs?: Record<string, string | number | boolean | undefined>;
}

const SHAPE_CLASS: Record<GoldButtonShape, string> = { button: "button", pill: "pill", icon: "icon-button" };

const attributes = (attrs: GoldButtonOptions["attrs"] = {}): string =>
  Object.entries(attrs)
    .filter(([, value]) => value !== false && value !== undefined)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`))
    .join("");

export const goldButton = ({ label, shape = "pill", primary = false, type = "button", className, attrs }: GoldButtonOptions): string => {
  const classes = [SHAPE_CLASS[shape], primary ? "primary" : "", "design", className ?? ""].filter(Boolean).join(" ");
  return `<button type="${type}" class="${classes}"${attributes(attrs)}><span class="gold">${escapeHtml(label)}</span></button>`;
};
