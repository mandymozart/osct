import { beforeAll, afterEach, vi } from "vitest";

/** Test hooks on `Image.prototype`: every image created since the last test, and the newest one */
interface ImageTestHooks {
  _instances: HTMLImageElement[];
  _lastInstance: HTMLImageElement | null;
}

const imageHooks = Image.prototype as HTMLImageElement & ImageTestHooks;

beforeAll(() => {
  const OriginalImage = global.Image;
  imageHooks._instances = [];
  global.Image = class extends OriginalImage {
    constructor() {
      super();
      imageHooks._lastInstance = this;
      imageHooks._instances.push(this);
    }
  };
  global.fetch = vi.fn();
  global.URL.createObjectURL = vi.fn();
  global.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
});

afterEach(() => {
  document.body.innerHTML = "";
  imageHooks._lastInstance = null;
  imageHooks._instances = [];
  vi.clearAllMocks();
  vi.clearAllTimers();
});

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// happy-dom 20 has no browser dialogs: confirm() declines by default, tests spy on it for the answer
window.confirm = () => false;

// UI texts: i18next is set up once for all tests (as main.ts does first in the app)
import "@/i18n";

// The game configuration (bundled copy) is loaded before each test file, as main.ts does before the app starts
import { loadGameConfiguration } from "@/utils/game-config";
await loadGameConfiguration();
