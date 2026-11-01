/**
 * An entry's words outside its form (`entry-edit.ts`): a link's URL to open, and the help of its row in the tree.
 */

/** A link's URL to open – only http(s); anything else is shown as text, never a link */
export const entryLink = (media: string | undefined): string | null => {
  const url = media?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
};

/** The entry row's help in the tree: what a tap does, with or without a target */
export const entryRowHelp = (entry: { category: string; page: number }, hasTarget: boolean): string =>
  `${entry.category} · p. ${entry.page} – a tap selects the entry: the Inspector shows its form${hasTarget ? ", the stage outlines its target" : " (it has no target)"}`;
