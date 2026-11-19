import { describe, expect, it, vi } from "vitest";
import { ARRIVED_KEY, deviceClass, reportArrival, sourceOf, withoutSource } from "../ArrivalService";

/** A window at `href` with a fake fetch, history and storage */
const fakeWindow = (href: string, userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile", stored: Record<string, string> = {}) => {
  const store = new Map(Object.entries(stored));
  const win = {
    location: { href },
    history: { state: null, replaceState: vi.fn((_: unknown, __: string, url: string) => (win.location.href = new URL(url, href).href)) },
    navigator: { userAgent, platform: "iPhone", maxTouchPoints: 5 },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
  };
  return { win, store };
};

describe("arrivals by source (#324)", () => {
  it("reads the source from ?s= – lowercase, a short code only", () => {
    expect(sourceOf("https://osct.buildingfictions.com/?s=bk1")).toBe("bk1");
    expect(sourceOf("https://x/entry/a?s=LP1")).toBe("lp1");
    expect(sourceOf("https://x/?s=no%20spaces")).toBeNull();
    expect(sourceOf("https://x/")).toBeNull();
  });

  it("takes s out of the address and keeps the rest", () => {
    expect(withoutSource("https://x/entry/a?s=bk1&osct=3.1.0#top")).toBe("/entry/a?osct=3.1.0#top");
    expect(withoutSource("https://x/?s=bk1")).toBe("/");
  });

  it("reports the book's code once – the source, the device, first – without a cookie, and cleans the address", () => {
    const { win, store } = fakeWindow("https://osct.buildingfictions.com/?s=bk1");
    expect(reportArrival(win as unknown as Window, "/api")).toBe("bk1");
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/");
    const [url, init] = win.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/arrivals");
    expect(init.credentials).toBe("omit");
    expect(JSON.parse(init.body as string)).toEqual({ source: "bk1", device: "phone", first: true });
    expect(store.get(ARRIVED_KEY)).toBe("1");
  });

  it("a browser that arrived before is no first arrival", () => {
    const { win } = fakeWindow("https://x/?s=bk1", undefined, { [ARRIVED_KEY]: "1" });
    reportArrival(win as unknown as Window, "/api");
    const init = (win.fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).first).toBe(false);
  });

  it("sends nothing without s, or without an API; a malformed s is only taken out", () => {
    const plain = fakeWindow("https://x/entry/a");
    expect(reportArrival(plain.win as unknown as Window, "/api")).toBeNull();
    expect(plain.win.fetch).not.toHaveBeenCalled();
    expect(plain.win.history.replaceState).not.toHaveBeenCalled();
    const noApi = fakeWindow("https://x/?s=bk1");
    expect(reportArrival(noApi.win as unknown as Window, "")).toBe("bk1");
    expect(noApi.win.fetch).not.toHaveBeenCalled();
    const broken = fakeWindow("https://x/?s=%3Cscript%3E");
    expect(reportArrival(broken.win as unknown as Window, "/api")).toBeNull();
    expect(broken.win.history.replaceState).toHaveBeenCalled();
    expect(broken.win.fetch).not.toHaveBeenCalled();
  });

  it("tells phone, tablet and desktop apart", () => {
    const nav = (userAgent: string, platform = "", maxTouchPoints = 0) => ({ navigator: { userAgent, platform, maxTouchPoints } }) as unknown as Window;
    expect(deviceClass(nav("Mozilla/5.0 (Linux; Android 14; SM-S901B) Mobile Safari"))).toBe("phone");
    expect(deviceClass(nav("Mozilla/5.0 (Linux; Android 14; SM-X710) Safari"))).toBe("tablet");
    expect(deviceClass(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", "MacIntel", 5))).toBe("tablet");
    expect(deviceClass(nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140", "Win32"))).toBe("desktop");
  });
});
