/**
 * The stage toolbar's **groups** (#180): transform (move / rotate / scale), pick (entities / nodes / targets) and
 * shading (wire / solid / textured / rendered). A group is one button showing its active option's icon; a tap opens
 * its options in a menu attached to the button. Where the toolbar has room (decided by the room it has, never by the
 * device) a group stays expanded – its options side by side, as before.
 *
 * This module is the pure part: the active option, the menu's arrow keys and which groups fit expanded. The page
 * (`routes/[book]/[spread]/+page.svelte`) holds the groups' options and `components/ToolGroup.svelte` draws one.
 */

export interface ToolOption<V extends string = string> {
  value: V;
  /** The short name, shown in the menu */
  name: string;
  /** The tooltip and label: the name and what it does (the Info view's help) */
  label: string;
  /** The keyboard shortcut, if any (shown in the menu, the page's key handler owns it) */
  key?: string;
}

/** The option that is active: the one with `value`, else the first */
export const activeOption = <O extends { value: string }>(options: readonly O[], value: string): O =>
  options.find(o => o.value === value) ?? options[0];

/** The index of the option that is active (0 when none matches) */
export const activeIndex = (options: readonly { value: string }[], value: string): number =>
  Math.max(0, options.findIndex(o => o.value === value));

/**
 * The menu's keyboard (WAI-ARIA menu): ↓ / → the next option, ↑ / ← the previous one (both wrap around), Home the
 * first, End the last. Any other key: null (the menu does not take it).
 */
export const menuStep = (key: string, index: number, count: number): number | null => {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
};

/** The toolbar's measures (px): its CSS in the page decides them */
export interface ToolbarMetrics {
  /** A button: the control height (square) */
  button: number;
  /** Between two buttons of a group */
  gap: number;
  /** Before a group after the first: its margin, padding and the rule */
  rule: number;
  /** The toolbar's own padding and border, both sides */
  chrome: number;
}

export interface GroupShape {
  /** How many options */
  options: number;
  /** Its buttons sit shoulder to shoulder (no gap – the shading spheres) */
  tight?: boolean;
}

/** A group's width (px): one button collapsed, its options side by side expanded */
export const groupWidth = (group: GroupShape, expanded: boolean, m: ToolbarMetrics): number => {
  const n = expanded ? group.options : 1;
  return n * m.button + (group.tight ? 0 : Math.max(0, n - 1) * m.gap);
};

/** The toolbar's width (px) with the groups expanded as `expanded` says */
export const toolbarWidth = (groups: readonly GroupShape[], expanded: readonly boolean[], m: ToolbarMetrics): number =>
  m.chrome + groups.reduce((sum, group, i) => sum + groupWidth(group, !!expanded[i], m) + (i > 0 ? m.gap + m.rule : 0), 0);

/**
 * Which groups stay expanded in a toolbar that may be `available` px wide: all of them collapsed to start with, then
 * each group in order expanded while the toolbar still fits – so the toolbar is always one row, as wide as the room
 * allows. A room too small even for the collapsed toolbar leaves every group collapsed.
 */
export const expandedGroups = (groups: readonly GroupShape[], available: number, m: ToolbarMetrics): boolean[] => {
  const expanded = groups.map(() => false);
  for (let i = 0; i < groups.length; i++) {
    expanded[i] = true;
    if (toolbarWidth(groups, expanded, m) > available) {
      expanded[i] = false;
      break;
    }
  }
  return expanded;
};
