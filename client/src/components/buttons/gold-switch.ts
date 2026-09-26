import { escapeHtml } from "@/utils";

/**
 * On / off switch like a phone's settings (Tilman 2026-09-27): a native checkbox (`role="switch"`) styled as
 * a glass pill with the bronze glow of the buttons and a knob that turns gold when on (`.switch` in the
 * design styles). The whole row is the label – tapping the text toggles too. The component must adopt the
 * design styles (`adoptDesignStyles`).
 */
export interface GoldSwitchOptions {
  /** Plain text – escaped here */
  label: string;
  checked: boolean;
  disabled?: boolean;
  /** Attributes of the checkbox (`data-action` …): `true` = present without value, `false` / `undefined` = left out */
  attrs?: Record<string, string | number | boolean | undefined>;
}

const attributes = (attrs: GoldSwitchOptions["attrs"] = {}): string =>
  Object.entries(attrs)
    .filter(([, value]) => value !== false && value !== undefined)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`))
    .join("");

export const goldSwitch = ({ label, checked, disabled = false, attrs }: GoldSwitchOptions): string =>
  `<label class="switch-row design"><span>${escapeHtml(label)}</span>` +
  `<input type="checkbox" role="switch" class="switch"${checked ? " checked" : ""}${disabled ? " disabled" : ""}${attributes(attrs)}></label>`;
