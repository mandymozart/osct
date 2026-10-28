import { TunePanel } from "@/components/dev-tools";
import "./editor-bar";
import "./preview-panel";

/**
 * The editor chunk (`import("@/editor")` from the editor page): the bar and the preview panel register themselves
 * on import; the tune panel is a dev tool that only debug builds define by themselves – the editor defines it in
 * every build.
 */
export const defineEditor = (): void => {
  if (!customElements.get("tune-panel")) customElements.define("tune-panel", TunePanel);
};
