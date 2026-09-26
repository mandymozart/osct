/**
 * Audio and haptic feedback (Tilman 2026-09-26): named events → a short sound + a vibration.
 *
 * - Sounds: Web Audio (no delay, several at once), files in `public/assets/sounds/<event>.wav`
 *   (placeholders from scripts/tools/generate-sounds.mjs – replace the files to change the sounds).
 *   Browsers only play audio after the first tap on the page; before that the events stay silent.
 * - Haptics: `navigator.vibrate` (Android). iOS has no vibration API – from iOS 18, toggling a native
 *   `<input type="checkbox" switch>` gives a light tick; it only works right after a tap (not while
 *   scrolling), elsewhere it does nothing.
 * - Settings (Info → Settings): sound and vibration on/off, kept in localStorage on this device.
 *
 * Standalone – no store dependency, so the store's managers can import it by file.
 */

export const FEEDBACK_EVENTS = ["tick", "tap", "found", "unlock"] as const;
export type FeedbackEvent = (typeof FEEDBACK_EVENTS)[number];

/** Vibration pattern per event (ms on / off / on …) */
const VIBRATION: Record<FeedbackEvent, number | number[]> = {
  tick: 8,
  tap: 10,
  found: 18,
  unlock: [22, 70, 22, 70, 45],
};

/** Minimum time between two plays of the same event + key (tracking flickers: found, found, found …) */
const COOLDOWN_MS: Partial<Record<FeedbackEvent, number>> = {
  found: 4000,
};

/** Loudness per event (0–1) – the tick plays often, keep it quiet */
const VOLUME: Record<FeedbackEvent, number> = {
  tick: 0.5,
  tap: 0.7,
  found: 0.8,
  unlock: 0.9,
};

export const FEEDBACK_STORAGE_KEY = "osct-feedback";

export interface FeedbackSettings {
  sound: boolean;
  haptics: boolean;
}

const DEFAULT_SETTINGS: FeedbackSettings = { sound: true, haptics: true };

const soundUrl = (event: FeedbackEvent) => `${import.meta.env.BASE_URL}assets/sounds/${event}.wav`;

export class FeedbackService {
  private static instance: FeedbackService | null = null;

  static getInstance(): FeedbackService {
    if (!FeedbackService.instance) FeedbackService.instance = new FeedbackService();
    return FeedbackService.instance;
  }

  private settings: FeedbackSettings = this.loadSettings();
  private context: AudioContext | null = null;
  private buffers = new Map<FeedbackEvent, Promise<AudioBuffer | null>>();
  private lastPlayed = new Map<string, number>();
  private switchLabel: HTMLLabelElement | null = null;
  private listening = false;

  /**
   * Start listening: unlock audio on the first touch / click, a `tap` on every button, link or
   * `[data-feedback="tap"]` (clicks cross shadow roots via `composedPath`). Call once at startup.
   */
  start(): void {
    if (this.listening || typeof document === "undefined") return;
    this.listening = true;
    document.addEventListener("pointerdown", this.unlockAudio, { capture: true, passive: true });
    document.addEventListener("click", this.handleClick, { capture: true });
  }

  getSettings(): FeedbackSettings {
    return { ...this.settings };
  }

  setSettings(settings: Partial<FeedbackSettings>): void {
    this.settings = { ...this.settings, ...settings };
    try {
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // private mode / blocked storage: the choice holds for this session
    }
  }

  /** Play an event; `key` separates cooldowns (e.g. per target) */
  play(event: FeedbackEvent, key = ""): void {
    const cooldown = COOLDOWN_MS[event];
    if (cooldown) {
      const id = `${event}:${key}`;
      const now = Date.now();
      if (now - (this.lastPlayed.get(id) ?? -Infinity) < cooldown) return;
      this.lastPlayed.set(id, now);
    }
    if (this.settings.haptics) this.vibrate(event);
    if (this.settings.sound) void this.playSound(event);
  }

  private loadSettings(): FeedbackSettings {
    try {
      const raw = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) ?? "null");
      if (raw && typeof raw === "object") {
        return {
          sound: typeof raw.sound === "boolean" ? raw.sound : DEFAULT_SETTINGS.sound,
          haptics: typeof raw.haptics === "boolean" ? raw.haptics : DEFAULT_SETTINGS.haptics,
        };
      }
    } catch {
      // no storage or broken JSON: defaults
    }
    return { ...DEFAULT_SETTINGS };
  }

  private vibrate(event: FeedbackEvent): void {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(VIBRATION[event]);
      } catch {
        // not allowed yet (no tap on the page so far)
      }
      return;
    }
    this.iosHaptic();
  }

  /** iOS 18+: toggling a native switch plays the system's haptic tick (no-op elsewhere) */
  private iosHaptic(): void {
    if (typeof document === "undefined") return;
    if (!this.switchLabel) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.id = "osct-haptic-switch";
      input.tabIndex = -1;
      const label = document.createElement("label");
      label.htmlFor = input.id;
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;left:-100vw;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      label.appendChild(input);
      document.body.appendChild(label);
      this.switchLabel = label;
    }
    this.switchLabel.click();
  }

  private audioContext(): AudioContext | null {
    if (this.context) return this.context;
    const Context = typeof window !== "undefined"
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
    if (!Context) return null;
    this.context = new Context();
    return this.context;
  }

  /** First touch / click: create + resume the audio context (browsers need a gesture) and preload */
  private unlockAudio = (): void => {
    const context = this.audioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    FEEDBACK_EVENTS.forEach(event => void this.buffer(event));
    if (context.state === "running") document.removeEventListener("pointerdown", this.unlockAudio, { capture: true });
  };

  private buffer(event: FeedbackEvent): Promise<AudioBuffer | null> {
    let buffer = this.buffers.get(event);
    if (!buffer) {
      const context = this.audioContext();
      buffer = !context
        ? Promise.resolve(null)
        : fetch(soundUrl(event))
            .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
            .then(data => context.decodeAudioData(data))
            .catch(error => {
              console.warn(`[Feedback] Sound "${event}" not loaded:`, error);
              return null;
            });
      this.buffers.set(event, buffer);
    }
    return buffer;
  }

  private async playSound(event: FeedbackEvent): Promise<void> {
    const context = this.context; // only after the first gesture – before that, stay silent
    if (!context || context.state !== "running") return;
    const buffer = await this.buffer(event);
    if (!buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = VOLUME[event];
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    source.start();
  }

  private handleClick = (event: Event): void => {
    const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
    // `data-feedback="none"` silences an element; a click on the switch is our own iOS haptic
    if (path.some(node => node.dataset.feedback === "none" || node === this.switchLabel)) return;
    const tappable = path.some(node =>
      node.tagName === "BUTTON" || node.tagName === "A" || node.getAttribute("role") === "button" || node.dataset.feedback === "tap");
    if (tappable) this.play("tap");
  };
}

/** Shortcut: `feedback("tick")` */
export const feedback = (event: FeedbackEvent, key?: string): void => FeedbackService.getInstance().play(event, key);
