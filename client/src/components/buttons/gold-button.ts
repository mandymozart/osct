import { escapeHtml } from "@/utils";

/**
 * The design buttons (DESIGN.md §7) as one markup helper – no custom element: the button stays a native
 * `<button>` in its component's shadow root, so event delegation, `hidden`, `aria-*` and per-component
 * styles (width, bronze shadow …) keep working. The component must adopt the design styles
 * (`adoptDesignStyles`) for the look.
 *
 *   button – onboarding button: black body, white glow (Start, Continue, Grant access …)
 *   pill   – glass pill (Entries, Dismiss, Resume …)
 *   icon   – round glass button ("i"); give it an `aria-label`
 *   primary – shining label + border sweep; without it the button is secondary
 */
export type GoldButtonShape = "button" | "pill" | "icon";

export interface GoldButtonOptions {
  /** Plain text – escaped here */
  label: string;
  shape?: GoldButtonShape;
  primary?: boolean;
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

export const goldButton = ({ label, shape = "pill", primary = false, className, attrs }: GoldButtonOptions): string => {
  const classes = [SHAPE_CLASS[shape], primary ? "primary" : "", "design", className ?? ""].filter(Boolean).join(" ");
  return `<button type="button" class="${classes}"${attributes(attrs)}><span class="gold">${escapeHtml(label)}</span></button>`;
};
