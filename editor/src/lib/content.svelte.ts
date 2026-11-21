import { getExperience as getConfigExperience, getConfigVersion, getGroups, getPlugins, getSkippedFeatures, getScenes, loadGameConfiguration, type SkippedFeature } from "@engine/content/game-config";
import type { ExperienceAppearance, ErrorInfo, GroupData, LogicData, PassData, Scene, VariableDeclaration } from "@engine/types";
import { authFetch, draftBaseUrl, getExperience } from "./api";
import { adoptRecordedSpecs } from "#lib/plugins/recorded.js";
import { plugins } from "./plugins.svelte";

/**
 * The experience's draft as the engine sees it: `loadGameConfiguration` reads the draft endpoint like the CDN
 * (`latest.json` → `<build>/game.config.json`), so the stage renders exactly what the reader would after a publish.
 * One configuration at a time (the engine's content runtime is a singleton): opening another experience reloads.
 * The stage runs in this page and reads the same configuration (#340).
 */
class Content {
  experienceId = $state<string | null>(null);
  scenes = $state<Scene[]>([]);
  /** The draft's groups (`GameConfiguration.groups`): the labels the scenes name (`Scene.group`) – the Logic panel's group level */
  groups = $state<GroupData[]>([]);
  /** The experience's post-processing (`experience.passes`, the master of every scene without its own); null = the experience has none */
  experiencePasses = $state<PassData[] | null>(null);
  /** How the experience's entities appear (`experience.appearance`, #265): a look per moment; null = the experience names none */
  experienceAppearance = $state<ExperienceAppearance | null>(null);
  /** The experience's rules (`experience.logic`, content schema 5.0); null = it has none */
  experienceLogic = $state<LogicData | null>(null);
  /** The rules' declared variables (`experience.variables`, B7); null = none declared */
  experienceVariables = $state<Record<string, VariableDeclaration> | null>(null);
  hash = $state<string | null>(null);
  error = $state<ErrorInfo | null>(null);
  /** What the draft has that this editor's engine does not know (an experience from a newer content build – RULES #10): skipped on the stage */
  skipped = $state<readonly SkippedFeature[]>([]);
  loading = $state(false);

  /** Where the experience's content files live (the import's `assetsBase`), read once per experience */
  assetsBase = $state<string | null>(null);
  /** The public folder of the experience's uploads (the Library's files), read with the assets base; null = the instance names none */
  libraryBase = $state<string | null>(null);

  /** Load (or reload after a save) the experience's draft; resolves with the startup error, if any */
  async load(experienceId: string): Promise<ErrorInfo | null> {
    this.loading = true;
    try {
      if (this.experienceId !== experienceId || this.assetsBase === null) {
        const { experience } = await getExperience(experienceId);
        this.assetsBase = experience.assetsBase;
        this.libraryBase = experience.libraryBase || null;
      }
      // The stage tries things out: a node may use a component the Code tab's plugins register at Run; targets switched off
      // stay with their entries – the editor works on them, only the reader leaves them out (#249)
      const error = await loadGameConfiguration({
        baseUrl: draftBaseUrl(experienceId), fetch: authFetch, assetsBase: this.assetsBase || undefined, unknownComponentTypes: "allow", keepSwitchedOffTargets: true,
      });
      this.experienceId = experienceId;
      this.error = error;
      this.scenes = error ? [] : getScenes();
      this.groups = error ? [] : getGroups();
      this.experiencePasses = error ? null : getConfigExperience().passes ?? null;
      this.experienceAppearance = error ? null : getConfigExperience().appearance ?? null;
      this.experienceLogic = error ? null : getConfigExperience().logic ?? null;
      this.experienceVariables = error ? null : getConfigExperience().variables ?? null;
      this.hash = error ? null : getConfigVersion().hash ?? null;
      this.skipped = error ? [] : getSkippedFeatures();
      // What the declared plugins recorded: the Inspector's rows before they load or run
      adoptRecordedSpecs(error ? [] : getPlugins());
      plugins.version += 1;
      return error;
    } finally {
      this.loading = false;
    }
  }

  scene(id: string): Scene | undefined {
    return this.scenes.find(scene => scene.id === id);
  }

  neighbour(id: string, direction: 1 | -1): Scene | undefined {
    const index = this.scenes.findIndex(scene => scene.id === id);
    if (index < 0 || !this.scenes.length) return undefined;
    return this.scenes[(index + direction + this.scenes.length) % this.scenes.length];
  }
}

export const content = new Content();
