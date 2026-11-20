import type { BehaviourRule, LogicCanvas, LogicData, VariableDeclaration } from "@engine/types";
import { logicData, logicRules } from "@shared/types/logic";
import { putExperienceLogic, putExperienceVariables, putScene } from "./api";
import { autosave } from "./autosave.svelte";
import { noteBaseline } from "./baselines";
import { content } from "./content.svelte";
import type { LogicContent } from "#lib/logic/project.js";

/**
 * A scene's and the experience's **rules** and the experience's **variables** as the editor edits them (content schema 5.0,
 * #334): what the draft has (`content` – `scene.logic`, `experience.logic`, `experience.variables`) with the edits not saved
 * yet on top. The Inspector's rule lists (`BehaviourRules`, home scene / experience), its variables editor and the Logic
 * panel's ops all write here; every edit reaches the draft by itself a moment later (#259, `autosave`): a scene's rules with
 * `PUT …/scenes/{sid}` `{ logic }`, the experience's with `PUT …/logic`, the variables with `PUT …/variables`. Each save is a
 * change in the experience's log (#312, kinds `scene`, `logic`, `variables`), so History lists it and Undo takes it back.
 * A save keeps the canvas the draft holds (L-T7's authoring data). After a save the workspace reads the draft again
 * (`onsaved`: the content, the stage – the engine reads a scene's and the experience's rules when the scene opens).
 */
class LogicEdit {
  experienceId = $state<string | null>(null);
  /** A scene's rules edited and not in the draft yet, by scene id */
  scenes = $state.raw<Record<string, BehaviourRule[]>>({});
  /** The experience's rules edited and not in the draft yet */
  experience = $state.raw<BehaviourRule[] | null>(null);
  /** The declarations edited and not in the draft yet (`null`: none – the field goes); undefined: the draft's */
  variables = $state.raw<Record<string, VariableDeclaration> | null | undefined>(undefined);
  /** The draft holds an edit now: the workspace reads it again */
  onsaved: ((experienceId: string) => Promise<void>) | null = null;

  /** Another experience: the edits of the last one are gone (their saves still run) */
  enter(experienceId: string): void {
    if (this.experienceId === experienceId) return;
    this.experienceId = experienceId;
    this.scenes = {};
    this.experience = null;
    this.variables = undefined;
  }

  /** A scene's rules as edited (the draft's when none is pending) */
  sceneRules(sceneId: string): BehaviourRule[] {
    return this.scenes[sceneId] ?? logicRules(content.scene(sceneId)?.logic);
  }

  /** The experience's rules as edited */
  experienceRules(): BehaviourRule[] {
    return this.experience ?? logicRules(content.experienceLogic);
  }

  /** The declared variables as edited (null: none) */
  declared(): Record<string, VariableDeclaration> | null {
    return this.variables !== undefined ? this.variables : content.experienceVariables;
  }

  /** The logic content with the rules and variables as edited: the scenes' and the experience's rules, the declarations */
  withLogic<T extends LogicContent>(logic: T): T {
    return {
      ...logic,
      scenes: logic.scenes.map(scene => ({ ...scene, rules: this.sceneRules(scene.id) })),
      rules: this.experienceRules(),
      variables: this.declared() ?? undefined,
    };
  }

  /** A scene's rules changed: saved with `PUT …/scenes/{sid}` `{ logic }` a moment after the last edit */
  setScene(sceneId: string, rules: BehaviourRule[]): void {
    const experienceId = this.experienceId ?? content.experienceId;
    if (!experienceId) return;
    const canvas = content.scene(sceneId)?.logic?.canvas;
    noteBaseline(`logic:${experienceId}:${sceneId}`, content.scene(sceneId)?.logic ?? null);
    this.scenes = { ...this.scenes, [sceneId]: rules };
    autosave.queue(`logic:${experienceId}:${sceneId}`, async () => {
      await putScene(experienceId, sceneId, { logic: logicData(rules, canvas) ?? null });
      await this.onsaved?.(experienceId);
      // Rules edited again meanwhile stay: their own save follows
      if (this.experienceId === experienceId && this.scenes[sceneId] === rules) {
        const { [sceneId]: _saved, ...rest } = this.scenes;
        this.scenes = rest;
      }
    });
  }

  /** The experience's rules changed: saved with `PUT …/logic` */
  setExperience(rules: BehaviourRule[]): void {
    const experienceId = this.experienceId ?? content.experienceId;
    if (!experienceId) return;
    const canvas: LogicCanvas | undefined = content.experienceLogic?.canvas;
    noteBaseline(`logic:${experienceId}`, content.experienceLogic);
    this.experience = rules;
    autosave.queue(`logic:${experienceId}`, async () => {
      const logic: LogicData | undefined = logicData(rules, canvas);
      await putExperienceLogic(experienceId, logic ?? null);
      await this.onsaved?.(experienceId);
      if (this.experienceId === experienceId && this.experience === rules) this.experience = null;
    });
  }

  /** The declarations changed (`null`: none left): saved with `PUT …/variables` */
  setVariables(variables: Record<string, VariableDeclaration> | null): void {
    const experienceId = this.experienceId ?? content.experienceId;
    if (!experienceId) return;
    noteBaseline(`variables:${experienceId}`, content.experienceVariables);
    this.variables = variables;
    autosave.queue(`variables:${experienceId}`, async () => {
      await putExperienceVariables(experienceId, variables && Object.keys(variables).length ? variables : null);
      await this.onsaved?.(experienceId);
      if (this.experienceId === experienceId && this.variables === variables) this.variables = undefined;
    });
  }
}

export const logicEdit = new LogicEdit();
