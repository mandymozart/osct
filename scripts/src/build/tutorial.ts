import fs from 'fs';
import path from 'path';
import type { StepData } from '../../../shared/types/game-config';
import { COMPAT_TUTORIAL } from '../../../shared/compat/tutorial';
import { CONTENT_DIR } from '../config';
import { buildWarnings } from '../lib/errors';

/**
 * The configuration's `tutorial`: the onboarding apps of content schema 2.24 and before require – the reader's own
 * English steps (`shared/compat/tutorial.ts`). The reader owns its onboarding (#236), so a content source's `steps/`
 * folder is not read; one that still has it gets a warning.
 */
export function buildTutorial(): StepData[] {
  if (fs.existsSync(path.join(CONTENT_DIR, 'steps'))) {
    buildWarnings.push('steps/ is not read: the onboarding is the app\'s own (its texts are in the app\'s translations) – the folder can go');
  }
  return COMPAT_TUTORIAL.map(step => ({ ...step }));
}
