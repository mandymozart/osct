/**
 * The workspace panel's tabs (#229): the **Inspector** – whatever is selected: the spread (also while nothing else is),
 * an entry, a target, its entity or a node –, **Environment**, **Library** and **Code**. `tree` stays a valid stored
 * value (the phone's sheet had it as a tab, gone in #317): the Inspector shows then. There is no Stage tab (#229): the spread is the Inspector's, the preview settings are the
 * stage toolbar's *view* group. The tab a workspace opens with: `?tab=` (the book page links the Environment so), else
 * the one stored in this browser – a tab stored before #229 (`stage`, `entity`) is the Inspector –, else the Inspector.
 */

export const TABS = ["tree", "inspector", "environment", "library", "code"] as const;
export type Tab = (typeof TABS)[number];

/** Tabs of earlier versions, stored in browsers or written in links: the tab that took their place */
const RENAMED: Readonly<Record<string, Tab>> = { stage: "inspector", entity: "inspector" };

/** A stored or asked tab as a tab of today; null for anything else */
export const tabOf = (value: string | null | undefined): Tab | null => {
  if (!value) return null;
  if ((TABS as readonly string[]).includes(value)) return value as Tab;
  return Object.hasOwn(RENAMED, value) ? RENAMED[value] : null;
};

/** The tab the workspace opens with: the asked one (`?tab=`), the stored one, the Inspector */
export const firstTab = (asked: string | null | undefined, stored: string | null | undefined): Tab =>
  tabOf(asked) ?? tabOf(stored) ?? "inspector";

/**
 * The Inspector's tabs show as words in a panel at least this wide (px); narrower, they are icons, so its head stays one
 * line (#172, RULES #32). With a finger every button is the touch height, wider too.
 */
export const WORD_TABS_MIN = { fine: 24 * 16, coarse: 28 * 16 } as const;

export const wordTabs = (panelWidth: number, coarse: boolean): boolean => panelWidth >= WORD_TABS_MIN[coarse ? "coarse" : "fine"];
