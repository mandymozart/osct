/**
 * Graphics options of the scan view (Info page → Settings), stored per device in localStorage:
 * - `onionSky`: looking up, the sky in the camera picture is replaced by the world's sky.
 * - `surroundings`: a world surrounds the reader while scanning, anchored to the book.
 * Both cost GPU time every frame; turning them off helps slower phones. Changes apply at once (`subscribe`).
 *
 * Standalone (no store dependency), like `FeedbackService`.
 */

export const GRAPHICS_STORAGE_KEY = "osct-graphics";

export interface GraphicsSettings {
  onionSky: boolean;
  surroundings: boolean;
}

const DEFAULT_SETTINGS: GraphicsSettings = { onionSky: true, surroundings: true };

export class GraphicsService {
  private static instance: GraphicsService | null = null;

  static getInstance(): GraphicsService {
    if (!GraphicsService.instance) GraphicsService.instance = new GraphicsService();
    return GraphicsService.instance;
  }

  private settings: GraphicsSettings = this.loadSettings();
  private listeners = new Set<(settings: GraphicsSettings) => void>();

  getSettings(): GraphicsSettings {
    return { ...this.settings };
  }

  setSettings(settings: Partial<GraphicsSettings>): void {
    this.settings = { ...this.settings, ...settings };
    try {
      localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Private mode / blocked storage: the setting holds for this session only
    }
    this.listeners.forEach(listener => listener(this.getSettings()));
  }

  /** Called on every change; returns the unsubscribe function */
  subscribe(listener: (settings: GraphicsSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private loadSettings(): GraphicsSettings {
    try {
      const raw = JSON.parse(localStorage.getItem(GRAPHICS_STORAGE_KEY) ?? "null");
      if (raw && typeof raw === "object") {
        return {
          onionSky: typeof raw.onionSky === "boolean" ? raw.onionSky : DEFAULT_SETTINGS.onionSky,
          surroundings: typeof raw.surroundings === "boolean" ? raw.surroundings : DEFAULT_SETTINGS.surroundings,
        };
      }
    } catch {
      // No storage or invalid JSON: defaults
    }
    return { ...DEFAULT_SETTINGS };
  }
}
