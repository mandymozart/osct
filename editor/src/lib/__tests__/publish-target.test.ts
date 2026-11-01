import { describe, expect, it } from "vitest";
import type { EnvironmentInfo, EnvironmentsInfo } from "../api";
import { publishStep, targetLabel, targetOf } from "../publish-target";

const WARNING = "No CDN connected – the published content is stored and served by this server only. Readers load from here without edge caching; heavy media goes through this server. Back up the content store.";
const staging: EnvironmentInfo = { env: "staging", store: "cdn", publish: true, url: "https://cdn.example/staging", warning: null };
const local: EnvironmentInfo = { env: "local", store: "server", publish: true, url: "http://127.0.0.1:8080/api/content/local", warning: WARNING };
const titles: Record<string, string> = { demo: "Demo" };
const titleOf = (id: string) => titles[id] ?? null;

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
  it("names the book, the build and the target, and what it replaces there", () => {
    const step = publishStep("osct", "Test Book", "1a2b3c4d5e6f", staging, { env: "staging", book: "osct", build: "aaaaaaaaaaaa", since: null }, titleOf);
    expect(step.title).toBe("Publish “Test Book” to staging · CDN");
    expect(step.build).toBe("Build 1a2b3c4d5e6f – the draft now.");
    expect(step.replaces).toBe("Replaces build aaaaaaaaaaaa of “Test Book” on staging.");
    expect(step).toMatchObject({ readers: null, warning: null, replace: false, action: "Publish to staging" });
  });

  it("an environment that serves nothing yet, or this very build", () => {
    expect(publishStep("osct", "Test Book", "1a2b3c4d5e6f", staging, undefined, titleOf).replaces).toBe("Nothing is published on staging yet.");
    expect(publishStep("osct", "Test Book", "1a2b3c4d5e6f", staging, { env: "staging", book: "osct", build: "1a2b3c4d5e6f", since: null }, titleOf).replaces).toContain("serves this build already");
    expect(publishStep("osct", "Test Book", null, staging, { env: "staging", error: "content-store-failed" }, titleOf).replaces).toContain("cannot be read");
  });

  it("over another book: says so, asks to replace it and sends replace", () => {
    const step = publishStep("osct", "Test Book", "1a2b3c4d5e6f", staging, { env: "staging", book: "demo", build: "bbbbbbbbbbbb", since: null }, titleOf);
    expect(step.replaces).toContain("Staging serves “Demo”. Publish “Test Book” instead?");
    expect(step).toMatchObject({ replace: true, action: "Replace on staging" });
    expect(publishStep("osct", "Test Book", null, staging, { env: "staging", book: null, build: null, since: null }, titleOf).replaces).toContain("a book the editor cannot tell");
  });

  it("production: every reader gets it", () => {
    const production: EnvironmentInfo = { ...staging, env: "production" };
    expect(publishStep("osct", "Test Book", "1a2b3c4d5e6f", production, undefined, titleOf).readers).toContain("Every reader");
  });

  it("this server as the target: the warning, in content words", () => {
    const step = publishStep("osct", "Test Book", "1a2b3c4d5e6f", local, undefined, titleOf);
    expect(step.title).toBe("Publish “Test Book” to local · this server");
    expect(step.warning).toBe(WARNING);
    expect(step.warning).toContain("content");
    expect(step.warning).not.toMatch(/\bdata\b/);
  });
});
