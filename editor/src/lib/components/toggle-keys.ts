/**
 * The keys that flip a switch (`Toggle.svelte`, #243): Space and Enter, as on the WAI-ARIA switch pattern. The switch
 * handles them on `keydown` itself – once per press, never on a held key's repeats – and cancels the button's own
 * activation (Enter's click on keydown, Space's on keyup), so a press flips it exactly once.
 */
export const isSwitchKey = (key: string): boolean => key === " " || key === "Enter";

/** What a keydown does to a switch: flip it, cancel the default only (a held key's repeat), or nothing (any other key) */
export function switchKeyDown(key: string, repeat: boolean): "flip" | "cancel" | "none" {
  if (!isSwitchKey(key)) return "none";
  return repeat ? "cancel" : "flip";
}
