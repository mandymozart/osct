/**
 * Which phone a trigger trial ran on (#235). Browsers no longer say it in the user agent – Safari freezes it, Chrome on
 * Android reduces it – so the trial strip asks the tester for the phone model and prefills what the browser can tell:
 * Chromium's client hints give the model code and the real Android version; on an iPhone the screen size and pixel
 * ratio narrow the pick list to the models with that screen (a guess the tester confirms). The report header records
 * the model as entered, where the prefill came from, the screen, the OS as reported and the language.
 */

/** The pick list of the trial strip, per maker; free text covers every other phone */
export const PHONE_MODELS: Readonly<Record<string, readonly string[]>> = {
  iPhone: [
    "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
    "iPhone 12 mini", "iPhone 12", "iPhone 12 Pro", "iPhone 12 Pro Max",
    "iPhone 13 mini", "iPhone 13", "iPhone 13 Pro", "iPhone 13 Pro Max",
    "iPhone SE (2nd gen)", "iPhone SE (3rd gen)",
    "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
    "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max",
    "iPhone 16e", "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max",
    "iPhone 17", "iPhone Air", "iPhone 17 Pro", "iPhone 17 Pro Max",
  ],
  Galaxy: [
    "Galaxy S21", "Galaxy S21+", "Galaxy S21 Ultra", "Galaxy S21 FE",
    "Galaxy S22", "Galaxy S22+", "Galaxy S22 Ultra",
    "Galaxy S23", "Galaxy S23+", "Galaxy S23 Ultra", "Galaxy S23 FE",
    "Galaxy S24", "Galaxy S24+", "Galaxy S24 Ultra", "Galaxy S24 FE",
    "Galaxy S25", "Galaxy S25+", "Galaxy S25 Ultra", "Galaxy S25 Edge",
  ],
  Pixel: [
    "Pixel 6", "Pixel 6 Pro", "Pixel 6a", "Pixel 7", "Pixel 7 Pro", "Pixel 7a",
    "Pixel 8", "Pixel 8 Pro", "Pixel 8a", "Pixel 9", "Pixel 9 Pro", "Pixel 9 Pro XL", "Pixel 9a",
  ],
};

/**
 * iPhone screens in CSS points (portrait) at their pixel ratio → the models with that screen, after Apple's published
 * point sizes. Display Zoom reports a smaller screen; such a size is not in the table and gets no guess.
 */
export const IPHONE_SCREENS: Readonly<Record<string, readonly string[]>> = {
  "375×667@2": ["iPhone SE (2nd gen)", "iPhone SE (3rd gen)", "iPhone 8"],
  "414×736@3": ["iPhone 8 Plus"],
  "375×812@3": ["iPhone 12 mini", "iPhone 13 mini", "iPhone X", "iPhone XS", "iPhone 11 Pro"],
  "414×896@2": ["iPhone 11", "iPhone XR"],
  "414×896@3": ["iPhone 11 Pro Max", "iPhone XS Max"],
  "390×844@3": ["iPhone 12", "iPhone 13", "iPhone 14", "iPhone 12 Pro", "iPhone 13 Pro", "iPhone 16e"],
  "428×926@3": ["iPhone 12 Pro Max", "iPhone 13 Pro Max", "iPhone 14 Plus"],
  "393×852@3": ["iPhone 14 Pro", "iPhone 15", "iPhone 16", "iPhone 15 Pro"],
  "430×932@3": ["iPhone 14 Pro Max", "iPhone 15 Plus", "iPhone 15 Pro Max", "iPhone 16 Plus"],
  "402×874@3": ["iPhone 16 Pro", "iPhone 17", "iPhone 17 Pro"],
  "420×912@3": ["iPhone Air"],
  "440×956@3": ["iPhone 16 Pro Max", "iPhone 17 Pro Max"],
};

/**
 * Samsung model codes (the part before the region letter: SM-S901B, SM-S901U → SM-S901) → the name testers know. A code
 * not in the table is kept as it is.
 */
export const SAMSUNG_MODELS: Readonly<Record<string, string>> = {
  "SM-G991": "Galaxy S21", "SM-G996": "Galaxy S21+", "SM-G998": "Galaxy S21 Ultra", "SM-G990": "Galaxy S21 FE",
  "SM-S901": "Galaxy S22", "SM-S906": "Galaxy S22+", "SM-S908": "Galaxy S22 Ultra",
  "SM-S911": "Galaxy S23", "SM-S916": "Galaxy S23+", "SM-S918": "Galaxy S23 Ultra", "SM-S711": "Galaxy S23 FE",
  "SM-S921": "Galaxy S24", "SM-S926": "Galaxy S24+", "SM-S928": "Galaxy S24 Ultra", "SM-S721": "Galaxy S24 FE",
  "SM-S931": "Galaxy S25", "SM-S936": "Galaxy S25+", "SM-S938": "Galaxy S25 Ultra", "SM-S937": "Galaxy S25 Edge",
};

/** The screen as the browser reports it: CSS pixels, portrait, and the device pixel ratio */
export interface ScreenSize {
  width: number;
  height: number;
  ratio: number;
}

/** What Chromium's client hints tell (empty elsewhere) */
export interface UaHints {
  model?: string;
  platform?: string;
  platformVersion?: string;
}

/** The prefill of the model field and where it came from */
export interface DevicePrefill {
  /** The value to put into an empty model field ("" – the tester types or picks it) */
  model: string;
  /** Models to offer first in the pick list (an iPhone's screen-size guess) */
  candidates: string[];
  /** For the report: where the prefill came from */
  source: string;
  /** For the strip: what the prefill means for the tester */
  hint: string;
}

/** The device lines of the report header */
export interface TrialDevice {
  /** The phone model as the tester entered or confirmed it */
  model: string;
  /** The tester's name or initials, optional */
  tester?: string;
  /** Where the field's prefill came from (`DevicePrefill.source`) */
  source: string;
  /** `375×812 @3` */
  screen: string;
  /** The OS as the browser reports it, with a note where the browser freezes or reduces it */
  os: string;
  /** `navigator.language` */
  language: string;
  userAgent: string;
}

/** The screen of this device, portrait whichever way the phone is held */
export const readScreen = (): ScreenSize => ({
  width: Math.min(screen.width, screen.height),
  height: Math.max(screen.width, screen.height),
  ratio: Math.round((window.devicePixelRatio || 1) * 100) / 100,
});

/** `375×812 @3` */
export const screenLine = (size: ScreenSize): string => `${size.width}×${size.height} @${size.ratio}`;

const isIPhone = (userAgent: string) => /iPhone/.test(userAgent);

/** The iPhone models with this screen, [] for an unknown size or not an iPhone */
export const iphoneCandidates = (userAgent: string, size: ScreenSize): string[] =>
  isIPhone(userAgent) ? [...(IPHONE_SCREENS[`${size.width}×${size.height}@${size.ratio}`] ?? [])] : [];

/** A Samsung model code's name (`SM-S901B` → `Galaxy S22`), null when the table does not know it */
export const samsungName = (code: string): string | null => {
  const match = code.trim().toUpperCase().match(/^(SM-[A-Z]\d{3})/);
  return match ? SAMSUNG_MODELS[match[1]] ?? null : null;
};

/** The model as the tester reads it: a known Samsung code gets its name, the code stays (`Galaxy S22 (SM-S901B)`) */
export const modelName = (code: string): string => {
  const name = samsungName(code);
  return name ? `${name} (${code.trim()})` : code.trim();
};

interface NavigatorUaData {
  platform?: string;
  getHighEntropyValues?(hints: string[]): Promise<{ model?: string; platform?: string; platformVersion?: string }>;
}

/** Chromium's client hints (model and real OS version); {} where the browser has none or refuses them */
export const readUaHints = async (nav: Navigator = navigator): Promise<UaHints> => {
  const data = (nav as Navigator & { userAgentData?: NavigatorUaData }).userAgentData;
  if (!data?.getHighEntropyValues) return {};
  try {
    const values = await data.getHighEntropyValues(["model", "platformVersion"]);
    return {
      model: values.model?.trim() || undefined,
      platform: values.platform ?? data.platform,
      platformVersion: values.platformVersion || undefined,
    };
  } catch {
    return {};
  }
};

/** `iPhone 12 mini / 13 mini / X` – the shared "iPhone" said once */
const shortList = (models: string[]) =>
  models.map((model, index) => (index ? model.replace(/^iPhone /, "") : model)).join(" / ");

/** The model field's prefill: the browser's model code where it gives one, otherwise an iPhone's screen-size guess */
export const devicePrefill = (userAgent: string, size: ScreenSize, hints: UaHints): DevicePrefill => {
  if (hints.model) {
    const model = modelName(hints.model);
    return { model, candidates: [], source: `from the browser: ${hints.model}`, hint: `from the browser: ${model} – check it` };
  }
  const candidates = iphoneCandidates(userAgent, size);
  if (candidates.length) {
    return {
      model: "",
      candidates,
      source: `screen-size guess: ${shortList(candidates)}`,
      hint: `a guess from the screen size (${screenLine(size)}): ${shortList(candidates)} – pick or type yours`,
    };
  }
  return { model: "", candidates: [], source: "no prefill", hint: "" };
};

/** The pick list: the screen-size guess first, then every listed phone */
export const pickList = (candidates: string[]): Array<{ group: string; models: string[] }> => {
  const groups = Object.entries(PHONE_MODELS).map(([group, models]) => ({ group, models: [...models] }));
  return candidates.length ? [{ group: "Screen-size guess", models: candidates }, ...groups] : groups;
};

/**
 * The OS as the browser reports it. Client hints give the real version; otherwise the user agent's, with a note where
 * it is known to lie: Safari 26 and newer freeze the iOS version, Chrome on Android reduces it to "Android 10; K".
 */
export const osLine = (userAgent: string, hints: UaHints): string => {
  if (hints.platform && hints.platformVersion) return `${hints.platform} ${hints.platformVersion} (from the browser)`;
  const ios = userAgent.match(/(?:iPhone|CPU) OS (\d+(?:_\d+)*)/);
  if (ios) {
    const version = ios[1].replace(/_/g, ".");
    const safari = userAgent.match(/Version\/(\d+)(?:\.[\d.]+)?/);
    return safari && Number(safari[1]) >= 26
      ? `iOS ${version} as Safari reports it – frozen: Safari ${safari[1]} comes with iOS ${safari[1]}`
      : `iOS ${version} as the browser reports it`;
  }
  const android = userAgent.match(/Android (\d+(?:\.\d+)*)/);
  if (android) {
    return /Android 10; K\)/.test(userAgent)
      ? "Android 10 as the browser reports it – reduced, the real version is not known"
      : `Android ${android[1]} as the browser reports it`;
  }
  return hints.platform ? `${hints.platform} (version not reported)` : "not reported – see the user agent";
};
