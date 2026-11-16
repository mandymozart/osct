/**
 * Subtitles of the scan view: the line the AR scene reports while a video with subtitle files plays (`<ar-bridge>`
 * hands it over), and the reader's choice to see it (Info page → Settings), stored per device in localStorage. On
 * until the reader turns it off: a video plays muted where the browser blocks sound. `<subtitle-line>` draws the line.
 *
 * Standalone (no store dependency), like `FeedbackService`.
 */

import { isObject } from "@shared/guards/game-config";

export const SUBTITLES_STORAGE_KEY = "osct-subtitles";

export interface SubtitleSettings {
  enabled: boolean;
}

const DEFAULT_SETTINGS: SubtitleSettings = { enabled: true };

export class SubtitleService {
  private static instance: SubtitleService | null = null;

  static getInstance(): SubtitleService {
    if (!SubtitleService.instance) SubtitleService.instance = new SubtitleService();
    return SubtitleService.instance;
  }

  private settings: SubtitleSettings = this.loadSettings();
  /** The scene's line, whether it is shown or not */
  private spoken: string | null = null;
  private listeners = new Set<(line: string | null) => void>();

  getSettings(): SubtitleSettings {
    return { ...this.settings };
  }

  setSettings(settings: Partial<SubtitleSettings>): void {
    this.settings = { ...this.settings, ...settings };
    try {
      localStorage.setItem(SUBTITLES_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Private mode / blocked storage: the setting holds for this session only
    }
    this.notify();
  }

  /** The line to draw: the scene's while subtitles are on, else none */
  get line(): string | null {
    return this.settings.enabled ? this.spoken : null;
  }

  /** The scene's line changed (null = nothing is spoken) */
  show(text: string | null): void {
    if (text === this.spoken) return;
    this.spoken = text;
    this.notify();
  }

  /** Called when the line to draw changes; returns the unsubscribe function */
  subscribe(listener: (line: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const line = this.line;
    this.listeners.forEach(listener => listener(line));
  }

  private loadSettings(): SubtitleSettings {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(SUBTITLES_STORAGE_KEY) ?? "null");
      if (isObject(raw) && typeof raw.enabled === "boolean") return { enabled: raw.enabled };
    } catch {
      // No storage or invalid JSON: defaults
    }
    return { ...DEFAULT_SETTINGS };
  }
}
