// The render_scene tool (#89): the picture of a scene (render.ts) as an image the agent sees, and the PNG's path.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { OsctApi } from "./api.ts";
import type { Config } from "./config.ts";
import { RENDER_VIEWS, renderScene, type RenderOptions, type Rendered } from "./render.ts";
import { failure } from "./result.ts";
import { editorHref, type AppLinks } from "./services.ts";
import type { ExperienceTree } from "../../shared/api/editor";

const ID = z.string().min(1).max(200);

export const RENDER_SIZE = { width: { min: 320, max: 2560, default: 1280 }, height: { min: 240, max: 1600, default: 800 } } as const;

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type RenderResult = { content: Content[]; isError?: boolean };

export function registerRenderTool(
  server: McpServer,
  api: OsctApi,
  config: Config,
  links: AppLinks,
  render: (options: RenderOptions) => Promise<Rendered> = renderScene,
): void {
  server.registerTool(
    "render_scene",
    {
      description:
        "A picture (PNG) of one scene of the experience's DRAFT as the editor's stage shows it – the desk, the surfaces with their reference images, the printed images and the entities as the reader sees them – to check a placement yourself after a save instead of asking the person. view: the stage's camera presets – reader (default: 35 cm above, tilted 30°, as a reader holds the phone), top (straight down), low (from the side, 75°), far (70 cm away, the whole scene). Runs the computer's own Chrome or Edge headless (OSCT_BROWSER names another) and takes 5–30 s; the PNG is also saved, its path in `file`. Shows what the editor shows: the live stage at the moment of the picture (an animation's frame), the floor grid and the axis as the editor's defaults draw them.",
      inputSchema: z.object({
        experience: ID.describe("the experience's id (list_experiences)"),
        scene: ID.describe("the scene's id (get_experience, list_scenes)"),
        view: z.enum(RENDER_VIEWS).default("reader"),
        width: z.number().int().min(RENDER_SIZE.width.min).max(RENDER_SIZE.width.max).default(RENDER_SIZE.width.default).describe("the picture's width in px"),
        height: z.number().int().min(RENDER_SIZE.height.min).max(RENDER_SIZE.height.max).default(RENDER_SIZE.height.default).describe("the picture's height in px"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ experience, scene, view, width, height }): Promise<RenderResult> => {
      try {
        const authorization = api.authorization();
        if (!authorization) return failure(new Error("Not signed in – render_scene opens the editor with this server's token.")) as RenderResult;
        // the scene exists (and the token works) before a browser starts
        const tree = await api.call<ExperienceTree>("GET", `/editor/experiences/${encodeURIComponent(experience)}`);
        if (!tree.scenes.some(s => s.id === scene)) {
          return { content: [{ type: "text", text: JSON.stringify({ error: { code: "not-found", message: `No scene "${scene}" in ${experience}.`, scenes: tree.scenes.map(s => s.id) } }) }], isError: true };
        }
        const rendered = await render({ api: config.api, editor: config.editor, authorization, experience, scene, view, width, height });
        const about = {
          file: rendered.file,
          experience,
          scene,
          view,
          size: { width, height },
          ...(rendered.blockedWrites ? { blockedWrites: rendered.blockedWrites } : {}),
          ...(rendered.settled ? {} : { note: "The stage's files were still loading when the wait ran out – something may be missing; render again." }),
          open: editorHref(links, experience, scene),
        };
        return { content: [{ type: "image", data: rendered.png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(about, null, 1) }] };
      } catch (error) {
        return failure(error) as RenderResult;
      }
    },
  );
}
