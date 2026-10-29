/**
 * The reader's graphics options the scene's surroundings follow (`scene/look-around`). The app owns the setting
 * (the reader: `GraphicsService`, stored on the device); the engine only reads it and listens for changes.
 */
export interface GraphicsSettings {
  /** Looking up, sky-like parts of the camera picture show the world's sky */
  onionSky: boolean;
  /** The world around the reader, anchored to the book */
  surroundings: boolean;
}

export interface GraphicsSource {
  getSettings(): GraphicsSettings;
  /** Called on every change; returns the unsubscribe function */
  subscribe(listener: (settings: GraphicsSettings) => void): () => void;
}

/** No surroundings, no sky (an app that passes no graphics source – the editor's stage) */
export const NO_GRAPHICS: GraphicsSource = {
  getSettings: () => ({ onionSky: false, surroundings: false }),
  subscribe: () => () => {},
};
