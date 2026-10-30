import type { DeviceStorage } from "@engine/utils/device-storage";

/**
 * The engine's switches for this device (the debug overlay's camera lens, resolution, zoom request and spreads kept
 * ready – `@engine/utils/device-storage`) in localStorage, each as `osct-<key>`. `main.ts` hands it to the engine at
 * startup, before anything reads a switch. Blocked storage throws; the engine then keeps the default.
 */
export class LocalDeviceStorage implements DeviceStorage {
  static key(key: string): string {
    return `osct-${key}`;
  }

  get(key: string): string | null {
    return localStorage.getItem(LocalDeviceStorage.key(key));
  }

  set(key: string, value: string | null): void {
    if (value === null) localStorage.removeItem(LocalDeviceStorage.key(key));
    else localStorage.setItem(LocalDeviceStorage.key(key), value);
  }
}
