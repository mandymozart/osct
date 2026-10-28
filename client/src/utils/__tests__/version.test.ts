import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { parseVersion } from "../version";

const readVersion = (file: string): string =>
  JSON.parse(readFileSync(resolve(__dirname, file), "utf8")).version;

describe("version helpers", () => {
  it("parses semver, rejects anything else", () => {
    expect(parseVersion("1.12.3")).toEqual({ major: 1, minor: 12, patch: 3 });
    expect(parseVersion("2.0.0-beta.1")).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(parseVersion("1.0")).toBeNull();
    expect(parseVersion("undefined")).toBeNull();
  });
});

// RULES.md #10 – one version for app, tooling and server (source: client/package.json); the content records the
// version it was built with as information only (compatibility: content schema, game-config-loading.test.ts)
describe("one version", () => {
  const appVersion = readVersion("../../../package.json");

  it("client and scripts package.json carry the same version", () => {
    expect(readVersion("../../../../scripts/package.json")).toBe(appVersion);
  });

  it("the server (server/api/src/Version.php) carries the same version", () => {
    const php = readFileSync(resolve(__dirname, "../../../../server/api/src/Version.php"), "utf8");
    expect(/const APP = '([^']+)'/.exec(php)?.[1]).toBe(appVersion);
  });

  it("the app is built with the client package version", () => {
    expect(__VITE_APP_VERSION__).toBe(appVersion);
  });
});
