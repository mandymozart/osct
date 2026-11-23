import fs from 'fs';
import path from 'path';
import type { LandingLayout, LayoutSheet } from '../../../shared/api/landing-extract';

/**
 * The print layout of a content folder (`layout/layout.json`, written by the delivery's layout step – `npm run layout`):
 * its sheets in print order, the landing's hero opens the book through them (#355). undefined when the folder has no
 * layout or it is not readable; the sheets' images are named by their content paths (`/assets/content/layout/…`).
 */
export function readLayout(contentDir: string): LandingLayout | undefined {
  const file = path.join(contentDir, 'layout', 'layout.json');
  if (!fs.existsSync(file)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { sheets?: unknown };
    return Array.isArray(data.sheets) ? { sheets: data.sheets as LayoutSheet[] } : undefined;
  } catch {
    return undefined;
  }
}
