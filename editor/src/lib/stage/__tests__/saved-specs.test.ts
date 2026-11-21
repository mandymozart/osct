import { describe, expect, it } from "vitest";
import { withoutSavedSpecs } from "../frame-protocol";

describe("withoutSavedSpecs (#269: a saved source's own specs win on the stage)", () => {
  const config = JSON.stringify({
    plugins: [
      { id: "tally", src: "/p/tally/plugin.js", api: "1.6", registered: { components: { tally: { params: { of: { kind: "choice", options: ["book", "spread"] } } } } } },
      { id: "other", src: "/p/other/plugin.js", api: "3.1", registered: { components: {} } },
    ],
  });

  it("drops the recorded specs of a plugin with a saved source and keeps the others", () => {
    const plugins = (JSON.parse(withoutSavedSpecs(config, new Set(["tally"]))) as { plugins: Array<Record<string, unknown>> }).plugins;
    expect(plugins[0]).toEqual({ id: "tally", src: "/p/tally/plugin.js", api: "1.6" });
    expect(plugins[1].registered).toEqual({ components: {} });
  });

  it("leaves a response alone without saved sources, without plugins, or that is no JSON", () => {
    expect(withoutSavedSpecs(config, new Set())).toBe(config);
    expect(withoutSavedSpecs('{"build":"x"}', new Set(["tally"]))).toBe('{"build":"x"}');
    expect(withoutSavedSpecs('"plugins" no json', new Set(["tally"]))).toBe('"plugins" no json');
  });
});
