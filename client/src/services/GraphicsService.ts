/**
 * Graphics options of the scan view (Info page → Settings), stored per device in localStorage:
 * - `onionSky`: looking up, the sky in the camera picture is replaced by the world's sky.
 * - `surroundings`: a world surrounds the reader while scanning, anchored to the found surfaces.
 * Both cost GPU time every frame; turning them off helps slower phones. Changes apply at once (`subscribe`).
 * - `textureQuality`: how large the maps of models with a texture set are loaded (#260) – `auto` goes by the device
 *   and its connection, a size (512 to 4096 px) is the reader's own choice; larger maps take longer to load and more
 *   graphics memory. The scan view swaps the maps at once, the preloader fetches the chosen size.
 * - `mediaQuality`: which level of pictures, videos and sounds with levels is loaded (#331) – `auto` goes by the screen,
 *   the device and its connection, `low` / `medium` / `high` are the reader's own choice (`mediaSrc`). A change swaps
 *   the loaded media at once – a playing video or sound goes on at the same spot in the new quality (`AssetStore.refreshMedia`).
 *
 * Standalone (no store dependency), like `FeedbackService`.
 */

export const GRAPHICS_STORAGE_KEY = "osct-graphics";

import { isMediaQuality, MEDIA_QUALITIES, type GraphicsSettings, type GraphicsSource, type MediaQuality, type TextureQuality } from "@engine/types/graphics";
import { chooseMediaSrc, mediaHints } from "@engine/scene/media-levels";
import type { LevelledKind, MediaLevelData } from "@shared/types/media-levels";
import { isObject } from "@shared/guards/game-config";
import { isTextureSize, TEXTURE_SIZES } from "@shared/types/textures";
export type { GraphicsSettings, MediaQuality, TextureQuality };
export { isMediaQuality, MEDIA_QUALITIES };

/** The choices of the texture quality, in the order the settings show them */
export const TEXTURE_QUALITIES: readonly TextureQuality[] = ["auto", ...TEXTURE_SIZES];
export const isTextureQuality = (value: unknown): value is TextureQuality => value === "auto" || isTextureSize(value);

/** Off until the reader turns them on (prototypes until the content's world arrives) */
const DEFAULT_SETTINGS: GraphicsSettings = { onionSky: false, surroundings: false };

export class GraphicsService implements GraphicsSource {
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

  /** The file of a picture, video or sound to load: the level the media quality chooses, else its own `src` (#331) */
  mediaSrc(kind: LevelledKind, src: string, levels: readonly MediaLevelData[] | undefined): string {
    return chooseMediaSrc(kind, src, levels, this.settings.mediaQuality, mediaHints());
  }

  /** Called on every change; returns the unsubscribe function */
  subscribe(listener: (settings: GraphicsSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private loadSettings(): GraphicsSettings {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(GRAPHICS_STORAGE_KEY) ?? "null");
      if (isObject(raw)) {
        return {
          onionSky: typeof raw.onionSky === "boolean" ? raw.onionSky : DEFAULT_SETTINGS.onionSky,
          surroundings: typeof raw.surroundings === "boolean" ? raw.surroundings : DEFAULT_SETTINGS.surroundings,
          // Not chosen yet = `auto`: the key is only there once the reader chose
          ...(isTextureQuality(raw.textureQuality) ? { textureQuality: raw.textureQuality } : {}),
          ...(isMediaQuality(raw.mediaQuality) ? { mediaQuality: raw.mediaQuality } : {}),
        };
      }
    } catch {
      // No storage or invalid JSON: defaults
    }
    return { ...DEFAULT_SETTINGS };
  }
}
