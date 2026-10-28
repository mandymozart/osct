import { describe, expect, it } from "vitest";
import { qrBaseUrl } from "../qr-generator";

const page = (origin: string): Pick<Location, "origin" | "protocol" | "port"> => {
  const url = new URL(origin);
  return { origin: url.origin, protocol: url.protocol, port: url.port };
};

describe("qrBaseUrl", () => {
  it("points at the dev server's Wi-Fi address with the page's protocol and port", () => {
    expect(qrBaseUrl("https://192.168.1.20:5173", page("https://localhost:5173"))).toBe("https://192.168.1.20:5173");
    expect(qrBaseUrl("https://192.168.1.20:5173", page("http://localhost:5174"))).toBe("http://192.168.1.20:5174");
  });

  it("keeps the dev server's port when the page has none (reverse proxy on a default port)", () => {
    expect(qrBaseUrl("https://192.168.1.20:5173", page("https://osct.local"))).toBe("https://192.168.1.20:5173");
  });

  it("points at the page's own origin in builds, where the build defines no server address", () => {
    expect(qrBaseUrl("", page("https://osct.porschuetz.de"))).toBe("https://osct.porschuetz.de");
    expect(qrBaseUrl("", page("http://localhost:4173"))).toBe("http://localhost:4173");
  });
});
