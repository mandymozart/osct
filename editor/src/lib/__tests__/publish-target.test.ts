import { describe, expect, it } from "vitest";
import type { EnvironmentInfo, EnvironmentsInfo } from "../api";
import { targetLabel, targetOf } from "../publish-target";

const WARNING = "No CDN connected – the published content is stored and served by this server only.";
const staging: EnvironmentInfo = { env: "staging", store: "cdn", publish: true, url: "https://cdn.example/osct/staging", warning: null };
const local: EnvironmentInfo = { env: "local", store: "server", publish: true, url: "http://127.0.0.1:8080/api/content/local", warning: WARNING };

// An instance publishes to its own environment only, and says where that is (#183)
describe("the publish target", () => {
  it("is the one environment the API marks for publishing", () => {
    const info: EnvironmentsInfo = { env: "staging", environments: [staging, { env: "production", store: "cdn", publish: false, url: null, warning: null }] };
    expect(targetOf(info)).toBe(staging);
    expect(targetOf(null)).toBeNull();
    expect(targetOf({ env: "staging", environments: [] })).toBeNull();
  });

  it("names the backend: the CDN or this server", () => {
    expect(targetLabel(staging)).toBe("staging · CDN");
    expect(targetLabel(local)).toBe("local · this server");
    expect(targetLabel({ env: "production", store: "server" })).toBe("production · this server");
  });
});
