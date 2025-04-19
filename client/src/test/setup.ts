import { beforeAll, afterEach, vi } from "vitest";

beforeAll(() => {
  const originalImage = global.Image;
  // @ts-ignore - adding _instances array
  Image.prototype._instances = [];
  // @ts-ignore - replacing Image constructor
  global.Image = class extends originalImage {
    constructor() {
      super();
      // @ts-ignore - storing last instance
      Image.prototype._lastInstance = this;
      // @ts-ignore - storing instance
      Image.prototype._instances.push(this);
    }
  };
  global.fetch = vi.fn();
  global.URL.createObjectURL = vi.fn();
  global.requestAnimationFrame = vi.fn((callback) => setTimeout(callback, 0));
});

afterEach(() => {
  document.body.innerHTML = "";
  // @ts-ignore - accessing _lastInstance
  Image.prototype._lastInstance = null;
  // @ts-ignore - accessing _instances
  Image.prototype._instances = [];
  vi.clearAllMocks();
  vi.clearAllTimers();
});

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
