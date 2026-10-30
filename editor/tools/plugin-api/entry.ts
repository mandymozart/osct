// The plugin author's surface of the engine: what `plugin-api.d.ts` declares (generate.mjs)
export type { ComponentApply, ComponentContext, ComponentInstance, LayerDefinition, NodeTypeBuild, NodeTypeContext, NodeTypeInstance, PluginApi, PluginModule } from "../../../engine/src/scene/plugins";
export type { CoreEvents, EventListener, PluginEvents, PluginProgress, PluginSpread, PluginVars, SceneStateName, VarScope, VarValue } from "../../../engine/src/scene/plugin-runtime";
export type { PassContext, PassFactory, PostPass } from "../../../engine/src/scene/post/registry";
export type { MaterialBuild, MaterialContext, MaterialInstance } from "../../../engine/src/scene/materials";
export type { TextureContext, TextureDraw, TextureInstance } from "../../../engine/src/scene/textures";
export type { ComponentParamSpec, ComponentSpec, MaterialSpec, NodeSrcKind, NodeTypeSpec, PassSpec, TextureSpec, TextureValue } from "../../../engine/src/types/index";
