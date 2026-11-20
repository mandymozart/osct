/**
 * Universal panel tabs (#318) – the pure part. Every content of a workspace's floating panels (the Tree, the Inspector,
 * Environment, Library, Code, Scenes, Info, History, Logic) is a **tab**, and any tab can live in any panel: the
 * **arrangement** says which panel holds which tabs, in which order, and which one each shows. A tab dragged into a
 * panel's head lands before or after the tab under the pointer (`dropIndex`); dragged out onto the stage it becomes a
 * panel of its own (`splitOut`, a `float-<n>` panel). A panel whose last tab leaves closes – a home panel (one of the
 * workspace's `PanelSpec`s) is then closed, a panel made by a drag goes. A tab no panel holds is closed; the panels
 * menu brings it back into its **home** panel. An **essential** tab (the Inspector – the selection) is never lost: the
 * panel holding it has no close, the menu does not close it, and an arrangement without it (storage edited by hand)
 * gets it back in its home panel.
 *
 * The arrangement is stored with the layout, per workspace (`osct-editor-panels`, under `TABS_KEY` beside the
 * panels' places). A layout stored before #318 has no arrangement: `migrate` makes one from it – the home panels it
 * had closed stay closed, the Inspector panel shows the tab it showed (`osct-editor-tab`) – so nobody's layout breaks.
 */

/** One tab: its content, where it lives by default and what it is called */
export interface TabSpec {
  id: string;
  name: string;
  /** An `Icon` name (kept a string here: this module is pure) */
  icon: string;
  /** What it is for: the Info view's help of its tab and of the head of a panel showing it */
  about: string;
  /** The panel it lives in by default and comes back to (a `PanelSpec` id) */
  home: string;
  /** Never closes: the panel that holds it cannot close (the Inspector) */
  essential?: boolean;
}

/** One panel's tabs, in order, and the one it shows */
export interface Holder {
  tabs: string[];
  active: string;
}

/** Panel id → its tabs; the key order is the order of the panels (the home panels', then the ones a drag made) */
export type Arrangement = Record<string, Holder>;

/** Where the arrangement is kept in a workspace's stored layout (beside the panels' places, which are keyed by id) */
export const TABS_KEY = "@tabs";

/** A panel a tab dragged out onto the stage made */
export const FLOAT_ID = /^float-\d+$/;

const essentialOf = (tabs: readonly TabSpec[]) => tabs.filter(t => t.essential).map(t => t.id);

/** The panel that holds a tab (null: the tab is closed) */
export const holderOf = (arr: Arrangement, tab: string): string | null => {
  for (const [id, h] of Object.entries(arr)) if (h.tabs.includes(tab)) return id;
  return null;
};

/** Whether a panel holds an essential tab – then it cannot close */
export const holdsEssential = (arr: Arrangement, panel: string, tabs: readonly TabSpec[]): boolean =>
  !!arr[panel]?.tabs.some(t => essentialOf(tabs).includes(t));

/** The arrangement a workspace starts with: every tab in its home panel, unless that panel starts closed */
export const defaultArrangement = (tabs: readonly TabSpec[], closedHomes: ReadonlySet<string> = new Set()): Arrangement => {
  const arr: Arrangement = {};
  for (const t of tabs) {
    if (closedHomes.has(t.home) && !t.essential) continue;
    (arr[t.home] ??= { tabs: [], active: t.id }).tabs.push(t.id);
  }
  return arr;
};

/** `arr` with `tab` taken out of whatever panel holds it; a panel left without tabs goes */
const without = (arr: Arrangement, tab: string): Arrangement => {
  const next: Arrangement = {};
  for (const [id, h] of Object.entries(arr)) {
    if (!h.tabs.includes(tab)) {
      next[id] = h;
      continue;
    }
    const rest = h.tabs.filter(t => t !== tab);
    if (!rest.length) continue;
    const at = h.tabs.indexOf(tab);
    next[id] = { tabs: rest, active: h.active === tab ? rest[Math.min(at, rest.length - 1)] : h.active };
  }
  return next;
};

/**
 * A tab moved into a panel at `index` (before the tab at `index`; the tabs' count = after the last), and shown there.
 * Within its own panel it is a new order. The panel it left closes when it was the last tab. Unknown panel: unchanged
 */
export const moveTab = (arr: Arrangement, tab: string, to: string, index: number): Arrangement => {
  const target = arr[to];
  if (!target) return arr;
  const from = holderOf(arr, tab);
  // In its own panel the index counts the tabs with it still there: after taking it out, those behind it move up
  const own = from === to ? target.tabs.indexOf(tab) : -1;
  const at = own >= 0 && index > own ? index - 1 : index;
  const rest = without(arr, tab);
  const base = rest[to]?.tabs ?? [];
  const tabs = [...base];
  tabs.splice(Math.max(0, Math.min(at, tabs.length)), 0, tab);
  const next: Arrangement = {};
  // The panel keeps its place in the order even when it was emptied for a moment (its only tab, dropped on itself)
  for (const id of Object.keys(arr)) {
    if (id === to) next[id] = { tabs, active: tab };
    else if (rest[id]) next[id] = rest[id];
  }
  return next;
};

/** A tab dragged out onto the stage: a panel of its own (`id`, after the others), the panel it left closes if empty */
export const splitOut = (arr: Arrangement, tab: string, id: string): Arrangement => {
  if (arr[id]) return arr;
  return { ...without(arr, tab), [id]: { tabs: [tab], active: tab } };
};

/** A panel shows one of its tabs */
export const selectTab = (arr: Arrangement, panel: string, tab: string): Arrangement => {
  const h = arr[panel];
  if (!h || !h.tabs.includes(tab) || h.active === tab) return arr;
  return { ...arr, [panel]: { ...h, active: tab } };
};

/** A panel closed (its ×): its tabs are closed with it – unless it holds an essential tab, then it stays */
export const closePanel = (arr: Arrangement, panel: string, tabs: readonly TabSpec[]): Arrangement => {
  if (!arr[panel] || holdsEssential(arr, panel, tabs)) return arr;
  const { [panel]: _gone, ...rest } = arr;
  return rest;
};

/** A tab closed (the panels menu): out of its panel, which closes if it was the last; an essential tab never closes */
export const closeTab = (arr: Arrangement, tab: string, tabs: readonly TabSpec[]): Arrangement =>
  essentialOf(tabs).includes(tab) ? arr : without(arr, tab);

/**
 * A tab opened (the panels menu, a link from another panel): shown where it is; a closed one comes back into its home
 * panel (after its tabs), and a closed home panel opens with it
 */
export const openTab = (arr: Arrangement, tab: string, tabs: readonly TabSpec[]): Arrangement => {
  const at = holderOf(arr, tab);
  if (at) return selectTab(arr, at, tab);
  const spec = tabs.find(t => t.id === tab);
  if (!spec) return arr;
  const home = arr[spec.home];
  return { ...arr, [spec.home]: { tabs: [...(home?.tabs ?? []), tab], active: tab } };
};

/** The next free id for a panel a drag makes */
export const nextFloatId = (arr: Arrangement): string => {
  let n = 1;
  for (const id of Object.keys(arr)) if (FLOAT_ID.test(id)) n = Math.max(n, Number(id.slice(6)) + 1);
  return `float-${n}`;
};

/**
 * Where a tab dropped on a head lands: before the first tab whose middle lies right of the pointer, else after the last.
 * `mids` are the head's tabs' middles (px, left to right)
 */
export const dropIndex = (mids: readonly number[], x: number): number => {
  const i = mids.findIndex(m => x < m);
  return i < 0 ? mids.length : i;
};

/** A drop that would change nothing: the tab onto its own place in its own panel */
export const sameSpot = (arr: Arrangement, tab: string, to: string, index: number): boolean => {
  const h = arr[to];
  if (!h) return false;
  const own = h.tabs.indexOf(tab);
  return own >= 0 && (index === own || index === own + 1);
};

/**
 * A stored arrangement checked against today's tabs and panels: known tabs only, each once, in a home panel or a
 * `float-<n>` one; a panel without tabs goes, one showing an unknown tab shows its first; an essential tab missing
 * comes back into its home panel. Null: nothing valid was stored
 */
export const readArrangement = (stored: unknown, tabs: readonly TabSpec[], homes: readonly string[]): Arrangement | null => {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return null;
  const panels = (stored as Record<string, unknown>).panels;
  if (typeof panels !== "object" || panels === null || Array.isArray(panels)) return null;
  const known = new Set(tabs.map(t => t.id));
  const seen = new Set<string>();
  let arr: Arrangement = {};
  for (const [id, value] of Object.entries(panels as Record<string, unknown>)) {
    if (!homes.includes(id) && !FLOAT_ID.test(id)) continue;
    if (typeof value !== "object" || value === null) continue;
    const h = value as Record<string, unknown>;
    if (!Array.isArray(h.tabs)) continue;
    const list = h.tabs.filter((t): t is string => typeof t === "string" && known.has(t) && !seen.has(t));
    list.forEach(t => seen.add(t));
    if (!list.length) continue;
    arr[id] = { tabs: list, active: typeof h.active === "string" && list.includes(h.active) ? h.active : list[0] };
  }
  for (const t of essentialOf(tabs)) if (!seen.has(t)) arr = openTab(arr, t, tabs);
  return arr;
};

/** The arrangement as it is stored */
export const storedArrangement = (arr: Arrangement): { v: 1; panels: Arrangement } => ({ v: 1, panels: arr });

/**
 * The arrangement for a layout stored before #318 (its places, keyed by panel id, closed or not): every tab in its home
 * panel; a home panel the person had closed – or that starts closed and was never opened – stays closed; the panel of
 * `shownTab` (the tab the Inspector showed, `osct-editor-tab`) shows it
 */
export const migrate = (
  oldPlaces: Readonly<Record<string, { closed?: boolean } | undefined>>,
  tabs: readonly TabSpec[],
  closedByDefault: ReadonlySet<string>,
  shownTab: string | null,
): Arrangement => {
  const homes = new Set(tabs.map(t => t.home));
  const closed = new Set([...homes].filter(h => oldPlaces[h]?.closed ?? closedByDefault.has(h)));
  let arr = defaultArrangement(tabs, closed);
  if (shownTab) {
    const at = holderOf(arr, shownTab);
    if (at) arr = selectTab(arr, at, shownTab);
  }
  return arr;
};
