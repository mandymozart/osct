import { answerKey, declinedReason, foreignSources, readAnswers, writeAnswers, type GuardAnswer, type GuardSource } from "./plugin-guard";
import type { PluginSummary } from "./api";

/**
 * The guard's prompt (#340, `plugin-guard.ts`): before the stage starts, the workspace asks `check` which plugins may run.
 * Sources the person already answered for (this version) are not asked again; the rest are asked once, together, in
 * `PluginGuardPrompt.svelte` – *Run* or *Don't run* for all of them. Returns the plugins kept off, with why. Without
 * `ask` (the render view, nobody there) every plugin runs: the render view writes nothing, so a plugin there cannot act
 * with anyone's rights (Tilman, 2026-11-22).
 */
class PluginGuard {
  /** The prompt shows while this is set: the experience and the plugins asked about */
  asking = $state<{ experienceId: string; sources: GuardSource[] } | null>(null);
  private answered: ((answer: GuardAnswer | null) => void) | null = null;

  async check(
    experienceId: string,
    stored: readonly Pick<PluginSummary, "id" | "updatedAt" | "updatedBy" | "size">[],
    declared: readonly { id: string; src: string }[],
    me: string | null,
    { ask = true }: { ask?: boolean } = {},
  ): Promise<Map<string, string>> {
    // Nobody to ask (the render view): everything runs – the view writes nothing, so no code acts with anyone's rights
    if (!ask) return new Map();
    const sources = foreignSources(stored, declared, me);
    const answers = readAnswers(experienceId);
    const open = sources.filter(source => !answers[answerKey(source)]);
    if (open.length) {
      const answer = await new Promise<GuardAnswer | null>(resolve => {
        this.answered?.(null);
        this.answered = resolve;
        this.asking = { experienceId, sources: open };
      });
      // Dismissed (the workspace closed): nothing runs, nothing is kept – the next open asks again
      open.forEach(source => (answers[answerKey(source)] = answer ?? "skip"));
      if (answer) writeAnswers(experienceId, sources, answers);
    }
    return new Map(sources.filter(source => answers[answerKey(source)] === "skip").map(source => [source.id, declinedReason(source)]));
  }

  /** The person's answer – for every plugin the prompt lists */
  answer(answer: GuardAnswer): void {
    const done = this.answered;
    this.answered = null;
    this.asking = null;
    done?.(answer);
  }

  /** The workspace closed while it asked: nothing runs, the answer is not kept */
  dismiss(): void {
    const done = this.answered;
    this.answered = null;
    this.asking = null;
    done?.(null);
  }
}

export const pluginGuard = new PluginGuard();
