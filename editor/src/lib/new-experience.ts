import { readerPath, slugFromTitle, slugProblem } from "@shared/api/experience-paths";

/**
 * A new experience (#343, docs/editor.md "Experiences"): a title and a slug – the experience's id, its reader address
 * `https://<instance>/<slug>/` and its content store's folder. The form proposes the slug from the title until the
 * person types one; a slug is checked here as the API checks it (shared/api/experience-paths.ts) and against the
 * experiences of this instance. No rename: once published, printed codes depend on it.
 */

export { slugFromTitle };

/** Why a slug cannot be the new experience's (null: it can): the slug rule, the site's own paths, an experience of that id */
export const slugCheck = (slug: string, existing: readonly string[]): string | null => {
  const problem = slugProblem(slug);
  if (problem) return problem;
  if (existing.some(id => id.toLowerCase() === slug)) return `There is an experience “${slug}” already – choose another slug.`;
  return null;
};

/** The reader's address of an experience (`https://<instance>/<slug>/`), or of a route in it */
export const readerAddress = (origin: string, experience: string, route = "/"): string =>
  `${origin.replace(/\/+$/, "")}${readerPath(experience, route)}`;
