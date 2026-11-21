import { describe, expect, it } from "vitest";
import type { EnvironmentInfo, EnvironmentsInfo } from "../api";
import { publishStep, targetLabel, targetOf } from "../publish-target";

const WARNING = "No CDN connected – the published content is stored and served by this server only. Readers load from here without edge caching; heavy media goes through this server. Back up the content store.";
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

describe("the step before a publish", () => {
  it("names the experience, the build and the target, and the build of it it replaces there", () => {
    const step = publishStep("Test Experience", "1a2b3c4d5e6f", staging, { env: "staging", build: "aaaaaaaaaaaa", since: null });
    expect(step.title).toBe("Publish “Test Experience” to staging · CDN");
    expect(step.build).toBe("Build 1a2b3c4d5e6f – the draft now.");
    expect(step.replaces).toBe("Replaces build aaaaaaaaaaaa of “Test Experience” on staging.");
    expect(step).toMatchObject({ readers: null, warning: null, action: "Publish to staging" });
  });

  it("with the Code tab's plugins, no draft build: their code makes the published one (#78)", () => {
    const live = { env: "staging", build: "1a2b3c4d5e6f", since: null };
    const one = publishStep("Test Experience", "1a2b3c4d5e6f", staging, live, 1);
    expect(one.build).toBe("The draft now, with the Code tab's plugin – transpiled, not type-checked; the build gets its name when it is published.");
    expect(one.replaces).toBe("Replaces build 1a2b3c4d5e6f of “Test Experience” on staging.");
    expect(publishStep("Test Experience", null, staging, undefined, 3).build).toContain("with the Code tab's 3 plugins");
  });

  it("an experience not published there yet, this very build, or a store that cannot be read", () => {
    expect(publishStep("Test Experience", "1a2b3c4d5e6f", staging, undefined).replaces).toBe("“Test Experience” is not published on staging yet.");
    expect(publishStep("Test Experience", "1a2b3c4d5e6f", staging, { env: "staging", build: "1a2b3c4d5e6f", since: null }).replaces).toContain("serves this build already");
    expect(publishStep("Test Experience", null, staging, "unreadable").replaces).toContain("cannot be read");
  });

  it("never asks to replace another experience: each one has its own store (#87)", () => {
    const step = publishStep("Demo", "1a2b3c4d5e6f", staging, undefined);
    expect(step.action).toBe("Publish to staging");
    expect(step).not.toHaveProperty("replace");
  });

  it("production: every reader of the experience gets it", () => {
    const production: EnvironmentInfo = { ...staging, env: "production" };
    expect(publishStep("Test Experience", "1a2b3c4d5e6f", production, undefined).readers).toBe("Every reader of “Test Experience” gets this version on their next start.");
  });

  it("this server as the target: the warning, in content words", () => {
    const step = publishStep("Test Experience", "1a2b3c4d5e6f", local, undefined);
    expect(step.title).toBe("Publish “Test Experience” to local · this server");
    expect(step.warning).toBe(WARNING);
    expect(step.warning).toContain("content");
    expect(step.warning).not.toMatch(/\bdata\b/);
  });
});
