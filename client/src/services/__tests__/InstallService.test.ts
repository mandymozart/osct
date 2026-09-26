import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallService } from "../InstallService";

/** A fake `beforeinstallprompt` (Chromium only – not in happy-dom) */
const installPrompt = (outcome: "accepted" | "dismissed") =>
  Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });

describe("InstallService", () => {
  const service = InstallService.getInstance();
  service.start();

  afterEach(() => { vi.restoreAllMocks(); });

  it("keeps the browser's install prompt and shows it once on request", async () => {
    const event = installPrompt("accepted");
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); // Chrome's own install banner stays on
    expect(service.getMethod()).toBe("prompt");
    expect(listener).toHaveBeenCalled();

    await expect(service.prompt()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(service.getMethod()).not.toBe("prompt"); // a prompt can be used once
    await expect(service.prompt()).resolves.toBe(false);
    unsubscribe();
  });

  it("explains Safari's Share → Add to Home Screen on iOS", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    expect(service.getMethod()).toBe("ios");
  });

  it("knows when the app already runs from the home screen", () => {
    window.dispatchEvent(new Event("appinstalled"));
    expect(service.getMethod()).toBe("installed");
  });
});
