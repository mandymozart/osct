/**
 * Printed-image details per target (three-free): what the delivery mapping knows about every target's printed
 * image – written by the content build's protocol command to `/trigger-protocol.json` (docs/content.md, "Trigger
 * test protocol"). Optional: the trial panel and the editor's mock stage work without it.
 */

export interface TriggerInfo {
  /** The delivered file */
  source?: string;
  /** Printed size in mm */
  width?: number;
  height?: number;
  /** Where on the page: "top left", "middle centre", "bottom right" … */
  position?: string;
  /** Exact position in mm from the top left corner of the page (when the layout was imported) */
  x?: number;
  y?: number;
  note?: string;
}

export type TriggerInfos = Record<string, TriggerInfo>;

export const TRIGGER_INFO_URL = "/trigger-protocol.json";

/** The protocol, or an empty record when the file was not generated (never throws) */
export const fetchTriggerInfos = async (): Promise<TriggerInfos> => {
  try {
    const response = await fetch(TRIGGER_INFO_URL);
    if (!response.ok) return {};
    const infos = await response.json();
    return infos && typeof infos === "object" ? (infos as TriggerInfos) : {};
  } catch {
    return {};
  }
};
