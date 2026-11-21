import { getPlugins } from "@engine/content/game-config";
import { declaredUses, type PluginData } from "@engine/types";
import { getPlugin } from "./api";
import { content } from "./content.svelte";
import { logicEdit } from "./logic-edit.svelte";
import { pluginCodeUses, type PluginUses } from "./logic/plugin-code";
import type { LogicContent } from "./logic/project";
import type { Context } from "./logic/types";
import { plugins } from "./plugins.svelte";
import type { Stage } from "./stage/stage.svelte";

/**
 * The experience's logic as the Logic panel draws it and the Log tab lists its problems (#334, #337): the scenes – the
 * open one's trees as the stage shows them, an edit not saved yet included –, the groups, the plugins the content
 * declares with what each one's code uses (a plugin whose specs declare its bus use needs no reading of its source;
 * the others' sources are read once per experience and again on Run / save), and the scenes' and the experience's rules
 * and the variables as edited (`logicEdit`). Called in a component's script: it reads its sources while that component
 * lives.
 */
/** The plugins' sources read so far, by experience, plugin and version (`readSource`) */
const sources = new Map<string, Promise<string | null>>();

export const logicContent = (props: () => { experienceId: string; sceneId: string; stage: Stage | null }) => {
  /** What each plugin's code uses, by plugin id */
  let code = $state<Record<string, PluginUses>>({});

  const declared = $derived.by((): PluginData[] => {
    void plugins.version;
    void content.scenes;
    return getPlugins();
  });

  const fetchSource = async (experienceId: string, plugin: PluginData): Promise<string | null> => {
    try {
      // A stored source: the one read the auto-load made (one request per saved version); else the declared module's
      if (plugins.stored.some(p => p.id === plugin.id)) return await plugins.savedSource(experienceId, plugin.id);
      return (await getPlugin(experienceId, plugin.id)).plugin.source;
    } catch {
      try {
        const response = await fetch(plugin.src);
        return response.ok ? await response.text() : null;
      } catch {
        return null;
      }
    }
  };
  /**
   * A source read once per version (#340: the panels re-read the registry often – the source is asked for again only when
   * it was saved again, or the declared module is another): its stored row's save time, else the module's URL
   */
  const readSource = (experienceId: string, plugin: PluginData): Promise<string | null> => {
    const row = plugins.stored.find(p => p.id === plugin.id);
    const key = `${experienceId}|${plugin.id}|${row ? `${row.updatedAt}|${row.size}` : plugin.src}`;
    let reading = sources.get(key);
    if (!reading) {
      reading = fetchSource(experienceId, plugin);
      sources.set(key, reading);
    }
    return reading;
  };

  $effect(() => {
    const list = declared.filter(p => !declaredUses(p.registered));
    const experienceId = props().experienceId;
    void plugins.stored;
    let current = true;
    void Promise.all(list.map(async p => [p.id, await readSource(experienceId, p)] as const)).then(read => {
      if (current) code = Object.fromEntries(read.flatMap(([id, source]) => (source === null ? [] : [[id, pluginCodeUses(source)]])));
    });
    return () => { current = false; };
  });

  const scenesShown = $derived.by(() => {
    const { sceneId, stage } = props();
    return content.scenes.map(scene => (scene.id !== sceneId || !stage ? scene : {
      ...scene, targets: scene.targets.map(target => ({ ...target, entity: stage.overrides.has(target.id) ? stage.treeOf(target.id) : target.entity })),
    }));
  });
  const logic = $derived<LogicContent>(logicEdit.withLogic({ scenes: scenesShown, groups: content.groups, plugins: declared, code }));

  return {
    /** The plugins the content declares */
    get declared(): PluginData[] { return declared; },
    get logic(): LogicContent { return logic; },
  };
};

/**
 * A box of the Logic panel asked for from elsewhere (the Log tab's problem rows): the panel goes to its level and marks
 * it. An ask waits until a panel takes it – a panel that opens after the ask takes it when it mounts.
 */
class LogicFocus {
  asked = $state<{ context: Context; node: string | null } | null>(null);

  ask(context: Context, node: string | null): void {
    this.asked = { context, node };
  }

  /** The waiting ask, taken (null when none waits) */
  take(): { context: Context; node: string | null } | null {
    const asked = this.asked;
    this.asked = null;
    return asked;
  }
}

export const logicFocus = new LogicFocus();
