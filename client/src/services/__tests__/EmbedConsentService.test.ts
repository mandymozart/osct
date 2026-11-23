import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMBED_CONSENT_STORAGE_KEY, EmbedConsentService } from "../EmbedConsentService";

const service = () => EmbedConsentService.getInstance();

beforeEach(() => {
  service().list().forEach(provider => service().revoke(provider));
});

describe("EmbedConsentService (#351)", () => {
  it("asks for every provider until the reader chose Always", () => {
    expect(service().isAllowed("youtube")).toBe(false);
    service().allow("youtube");
    service().allow("example.org");
    expect(service().isAllowed("youtube")).toBe(true);
    expect(service().list()).toEqual(["youtube", "example.org"]);
    expect(JSON.parse(localStorage.getItem(EMBED_CONSENT_STORAGE_KEY)!)).toEqual(["youtube", "example.org"]);
  });

  it("asks again after Ask again and tells its listeners", () => {
    const listener = vi.fn();
    const unsubscribe = service().subscribe(listener);
    service().allow("vimeo");
    service().revoke("vimeo");
    service().revoke("vimeo");
    expect(service().isAllowed("vimeo")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
