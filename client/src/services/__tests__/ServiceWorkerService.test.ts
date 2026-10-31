import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerService } from "../ServiceWorkerService";
import { UpdateService } from "../UpdateService";

describe("ServiceWorkerService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const registration = { update: vi.fn() };
  const stubServiceWorker = () => {
    const register = vi.fn().mockResolvedValue(registration);
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: { register, controller: null, addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    return register;
  };

  it("registers nothing outside production builds (the dev server has no worker)", () => {
    vi.stubEnv("PROD", false);
    const register = stubServiceWorker();
    ServiceWorkerService.register();
    window.dispatchEvent(new Event("load"));
    expect(register).not.toHaveBeenCalled();
  });

  it("registers the worker for the whole app in production builds", () => {
    vi.stubEnv("PROD", true);
    const register = stubServiceWorker();
    ServiceWorkerService.register();
    window.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/service-worker.js", { scope: "/" });
  });

  it("hands the registration to UpdateService, which asks it for new versions while the page stays open", async () => {
    vi.stubEnv("PROD", true);
    stubServiceWorker();
    const watch = vi.spyOn(UpdateService.getInstance(), "watch").mockReturnValue(() => {});
    ServiceWorkerService.register();
    window.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(watch).toHaveBeenCalledWith(registration));
  });
});
