import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerService } from "../ServiceWorkerService";

describe("ServiceWorkerService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const stubServiceWorker = () => {
    const register = vi.fn().mockResolvedValue({});
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: { register } });
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
});
