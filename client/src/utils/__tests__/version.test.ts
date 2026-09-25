import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { ErrorCode } from "@/types";
import { checkConfigurationVersion, getConfigVersion } from "@/utils/game-config";
import { compareVersions, parseVersion } from "../version";

const readVersion = (file: string): string =>
  JSON.parse(readFileSync(resolve(__dirname, file), "utf8")).version;

describe("version helpers", () => {
  it("parses semver, rejects anything else", () => {
    expect(parseVersion("1.12.3")).toEqual({ major: 1, minor: 12, patch: 3 });
    expect(parseVersion("2.0.0-beta.1")).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(parseVersion("1.0")).toBeNull();
    expect(parseVersion("undefined")).toBeNull();
  });

  it("treats MINOR/PATCH as compatible, MAJOR as incompatible", () => {
    expect(compareVersions("1.1.0", "1.1.0")).toBe("same");
    expect(compareVersions("1.1.0", "1.0.5")).toBe("compatible");
    expect(compareVersions("1.1.0", "1.4.0")).toBe("compatible");
    expect(compareVersions("1.1.0", "2.0.0")).toBe("incompatible");
    expect(compareVersions("2.0.0", "1.9.9")).toBe("incompatible");
    expect(compareVersions("1.1.0", "")).toBe("incompatible");
  });

  it("refuses a game configuration of another MAJOR at startup", () => {
    expect(checkConfigurationVersion("1.1.0", "1.0.0")).toBeNull();
    expect(checkConfigurationVersion("2.0.0", "1.1.0")).toMatchObject({
      code: ErrorCode.NOT_SUPPORTED,
      type: "critical",
    });
  });
});

// RULES.md #10 – one version for app and content build (source: client/package.json)
describe("one version", () => {
  const appVersion = readVersion("../../../package.json");

  it("client and scripts package.json carry the same version", () => {
    expect(readVersion("../../../../scripts/package.json")).toBe(appVersion);
  });

  it("the app is built with the client package version", () => {
    expect(__VITE_APP_VERSION__).toBe(appVersion);
  });

  it("game.config.json was built with the app version (rebuild the content after a bump)", () => {
    expect(getConfigVersion().version).toBe(appVersion);
  });
});
