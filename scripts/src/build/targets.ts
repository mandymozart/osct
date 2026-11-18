import { MAX_TARGETS_PER_SCENE } from '../config';
import { isTargetEnabled, type SceneData } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import type { EntryBuild } from './entries';

/** A scene has at most MAX_TARGETS_PER_SCENE targets switched on (RULES.md #3) – the reader tracks no other */
export function checkTargetsPerScene(scenes: SceneData[], builds: EntryBuild[]): void {
  for (const scene of scenes) {
    const targets = builds.flatMap(b =>
      b.sceneId === scene.id && b.entry.target && isTargetEnabled(b.entry.target) ? [b.entry.target.id] : []);
    if (targets.length > MAX_TARGETS_PER_SCENE) {
      buildErrors.push(`scenes/${scene.id} has ${targets.length} targets, max is ${MAX_TARGETS_PER_SCENE}.`);
    }
    targets.forEach(target => console.log(`🎯 ${scene.id} ${target}`));
  }
}
