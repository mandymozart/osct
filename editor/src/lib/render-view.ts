import type { ArStatus } from "@engine/types";
import { PREVIEW_VIEWS, type PreviewView } from "./stage/preview";

/**
 * The **render view** of a scene (#89): `/editor/<experience>/<scene>/?render` (or `?render=top` – one of the stage's
 * view presets, `reader` by default) shows the workspace's stage alone – no top bar, no panels, no toolbar, no notices –
 * so a headless browser can take a picture of the scene as the editor's stage shows it (the MCP server's
 * `render_scene`, docs/mcp.md). The page says how far it got on `<html data-osct-render="loading | ready | error">`,
 * an error's words on `data-osct-render-error`; `ready` = the stage runs on the draft (its files may still be loading –
 * the renderer waits for the network to go quiet). Nothing else changes: the same session gate, the same draft, the
 * same stage; the view preset is set like the toolbar's (stored on the device, as a preset clears a free orbit).
 */
export const RENDER_PARAM = "render";

export type RenderState = "loading" | "ready" | "error";

export interface RenderRequest {
  view: PreviewView;
}

/** `?render[=view]` → the render view with its view preset (an unknown or empty value is the reader's view); else null */
export const renderRequest = (params: Pick<URLSearchParams, "has" | "get">): RenderRequest | null => {
  if (!params.has(RENDER_PARAM)) return null;
  const value = params.get(RENDER_PARAM) ?? "";
  return { view: PREVIEW_VIEWS.includes(value as PreviewView) ? (value as PreviewView) : "reader" };
};

/** How far the render view got: an error (the draft's or the stage's) wins, `ready` once the stage runs */
export const renderState = (status: ArStatus | undefined, error: string | null): RenderState => {
  if (error || status === "error") return "error";
  return status === "running" || status === "paused" ? "ready" : "loading";
};

/** Writes the state (and an error's words) on `<html>`, where the renderer reads them */
export const markRender = (state: RenderState, error: string | null = null, root: HTMLElement = document.documentElement): void => {
  root.dataset.osctRender = state;
  if (state === "error" && error) root.dataset.osctRenderError = error.slice(0, 500);
  else delete root.dataset.osctRenderError;
};
