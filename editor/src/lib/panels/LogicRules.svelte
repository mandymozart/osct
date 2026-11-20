<script lang="ts">
  import { nodeAddress } from "@engine/types";
  import { content } from "#lib/content.svelte.js";
  import { logicEdit } from "#lib/logic-edit.svelte.js";
  import { experienceEvents, experienceVariables, subtreeNames } from "#lib/behaviour-edit.js";
  import { logicTypes, typeProblemsByRule, type LogicContent } from "#lib/logic/project.js";
  import Section from "#lib/components/Section.svelte";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import BehaviourRules, { type NodeChoice } from "./BehaviourRules.svelte";
  import VariablesEditor from "./VariablesEditor.svelte";

  /**
   * A scene's or the experience's **rules** in the Inspector (content schema 5.0, #334): the rule list of
   * `BehaviourRules` with the differences of these homes – they hear the bus (scene events and core events, not a node's
   * own), name a node by address (`target:<id>/<name>` – a scene's rules its own targets', the experience's any scene's)
   * and go to a scene (goto). The experience also shows its **variables** (`VariablesEditor`). Edits go to `logicEdit`,
   * which saves them by themselves (`PUT …/scenes/{sid}` `{ logic }`, `PUT …/logic`) – History lists them, Undo takes
   * them back. A condition or a set value that does not check out is refused in its field (B8); the rules' type problems
   * show under each rule.
   */
  let { home, sceneId = null, stage = null }: { home: "scene" | "experience"; sceneId?: string | null; stage?: Stage | null } = $props();

  /** The draft's logic with the edits not saved yet */
  const logic = $derived<LogicContent>(logicEdit.withLogic({ scenes: content.scenes }));
  const rules = $derived(home === "scene" && sceneId ? logicEdit.sceneRules(sceneId) : logicEdit.experienceRules());
  const types = $derived(logicTypes(logic));
  const trees = $derived(content.scenes.flatMap(s => s.targets.flatMap(t => (t.entity ? [t.entity] : []))));
  const allRules = $derived([...(logic.rules ?? []), ...logic.scenes.flatMap(s => s.rules ?? [])]);
  const variables = $derived([...new Set([...experienceVariables(trees, (stage?.vars ?? []).map(v => v.name), allRules), ...Object.keys(logic.variables ?? {})])].sort());
  const events = $derived(experienceEvents(trees, (stage?.events ?? []).map(e => e.event), allRules));
  const scenes = $derived(content.scenes.map(s => ({ id: s.id, label: s.label || s.id })));
  /** The nodes the rules can name: a scene's targets' (its own), or every scene's for the experience */
  const nodes = $derived.by((): NodeChoice[] => {
    const shown = home === "scene" ? content.scenes.filter(s => s.id === sceneId) : content.scenes;
    return shown.flatMap(scene => scene.targets.flatMap(t => {
      if (!t.entity) return [];
      const prefix = home === "experience" ? `${scene.label || scene.id} · ` : "";
      return [
        { address: nodeAddress(t.id), label: `${prefix}${t.id}` },
        ...subtreeNames(t.entity).filter(name => name !== t.entity!.name).map(name => ({ address: nodeAddress(t.id, name), label: `${prefix}${t.id} / ${name}` })),
      ];
    }));
  });
  const problems = $derived(typeProblemsByRule(rules, types));
  const change = (next: typeof rules) => (home === "scene" && sceneId ? logicEdit.setScene(sceneId, next) : logicEdit.setExperience(next));
</script>

<Section id="logic.{home}" label="rules" summary={rules.length ? String(rules.length) : "none"} open={rules.length > 0}
  help={home === "scene"
    ? "The scene's own rules: live while the scene is open. They hear the stage's events (a scene event, or a core event like sceneChanged or targetFound), read variables in a condition and act on the scene's targets' nodes, set variables, emit events and go to another scene. Every edit saves itself."
    : "The experience's own rules: live for the whole session, across scene switches – they hear the stage's events in every scene, act on a node of the open scene's targets, set variables, emit events and go to a scene. Every edit saves itself."}>
  <BehaviourRules {rules} {home} {nodes} {scenes} {variables} {events} {types} uid="logic-{home}"
    problemsOf={i => problems.filter(p => p.rule === i).map(p => p.message)} onchange={change} />
</Section>

{#if home === "experience"}
  <Section id="logic.variables" label="variables" summary={String(Object.keys(logic.variables ?? {}).length)} open={false}
    help="The rules' variables with their type (number, integer, true / false, text), the scope a set without its own writes and the value a variable has before anything sets it. A variable that is not declared takes the type of its first set – shown as inferred, with a button to declare it. A set or a condition of another type is a problem.">
    <VariablesEditor {types} />
  </Section>
{/if}
