import { gzipSync } from "zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compressedUrl, loadCompressed } from "../compressed";

const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
const respond = (body: Uint8Array | null, status = 200) =>
  new Response(body, { status });

describe(".mind / .glb loading (gzip copy from the content build)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and unpacks the .gz where the browser can", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url =>
      String(url).endsWith(".gz") ? respond(new Uint8Array(gzipSync(bytes))) : respond(null, 404));
    expect(compressedUrl("/a.mind")).toBe("/a.mind.gz");
    expect(compressedUrl("/m.glb")).toBe("/m.glb.gz");
    expect(compressedUrl("/v.mp4")).toBe("/v.mp4");
    expect(new Uint8Array(await loadCompressed("/a.mind"))).toEqual(bytes);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("takes the .gz as it is when the server sent it with Content-Encoding (already unpacked)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async url =>
      String(url).endsWith(".gz") ? respond(bytes) : respond(null, 404));
    expect(new Uint8Array(await loadCompressed("/m.glb"))).toEqual(bytes);
  });

  it("falls back to the .mind when the .gz is missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async url =>
      String(url).endsWith(".gz") ? respond(null, 404) : respond(bytes));
    expect(new Uint8Array(await loadCompressed("/a.mind"))).toEqual(bytes);
  });
});
