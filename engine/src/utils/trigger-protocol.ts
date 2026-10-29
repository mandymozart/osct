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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const TEXT_FIELDS = ["source", "position", "note"] as const;
const NUMBER_FIELDS = ["width", "height", "x", "y"] as const;

/** The protocol file's targets with the fields of the right type; anything else in it is left out */
export const readTriggerInfos = (raw: unknown): TriggerInfos => {
  const infos: TriggerInfos = {};
  if (!isRecord(raw)) return infos;
  for (const [targetId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const info: TriggerInfo = {};
    for (const field of TEXT_FIELDS) {
      const text = value[field];
      if (typeof text === "string") info[field] = text;
    }
    for (const field of NUMBER_FIELDS) {
      const number = value[field];
      if (typeof number === "number" && Number.isFinite(number)) info[field] = number;
    }
    infos[targetId] = info;
  }
  return infos;
};

/** The protocol, or an empty record when the file was not generated (never throws) */
export const fetchTriggerInfos = async (): Promise<TriggerInfos> => {
  try {
    const response = await fetch(TRIGGER_INFO_URL);
    if (!response.ok) return {};
    return readTriggerInfos(await response.json());
  } catch {
    return {};
  }
};
