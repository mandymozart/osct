import type { EntityData } from "@shared/types/game-config";
import type { SelectionState } from "./selection";
import { captionOf, formatLabelOf, pagesOf } from "./spread-grid";

/**
 * The header's search through the whole book (#237): entries (title and text), spreads (title, pages – a page number
 * finds its spread), targets (id, the entry's title) and named nodes – accents and case ignored, every word of the
 * query found. Hits are grouped by kind, ranked within a group (the label starting with the query, then a word of it,
 * then anywhere in the label, then only in the text) and kept in book order at the same rank; each names its spread
 * and page and what a pick selects. Pure: `BookSearch.svelte` reads the draft's spreads and draws it.
 */

/** A spread as the search reads it – the engine's `Spread` fits */
export interface SearchSpread {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  format?: string;
  entries: readonly { id: string; title: string; body?: string; page: number; target?: { id: string; imageSrc?: string } }[];
  targets: readonly { id: string; entryId: string; imageSrc?: string; entity?: EntityData }[];
}

export const SEARCH_KINDS = ["entry", "spread", "target", "node"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export const SEARCH_KIND_LABELS: Record<SearchKind, string> = { entry: "Entries", spread: "Spreads", target: "Targets", node: "Nodes" };

export interface SearchHit {
  kind: SearchKind;
  /** Unique among the hits */
  key: string;
  label: string;
  /** Where it is: the spread's caption, with the page for an entry */
  where: string;
  /** For a hit in an entry's text: the words around it */
  excerpt?: string;
  spreadId: string;
  /** What a pick selects on that spread */
  select: SelectionState;
  /** 0 = the best */
  rank: number;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
  /** Hits left out beyond the group's limit */
  more: number;
}

/** A text as the search compares it: lower case, without accents */
export const folded = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");

/** The query's words, folded */
export const queryWords = (query: string): string[] => folded(query).split(/\s+/).filter(Boolean);

/** How well a label matches: 0 it starts with the query, 1 a word of it starts with the first word, 2 it holds every word; null not */
const labelRank = (label: string, words: readonly string[]): number | null => {
  const text = folded(label);
  if (!words.every(word => text.includes(word))) return null;
  if (text.startsWith(words.join(" "))) return 0;
  if (text.split(/[^\p{L}\p{N}]+/u).some(part => part.startsWith(words[0]))) return 1;
  return 2;
};

/** The words around the first word of the query in a text, on one line */
export const excerptOf = (text: string, words: readonly string[], room = 32): string => {
  const line = text.replace(/\s+/g, " ").trim();
  const at = folded(line).indexOf(words[0] ?? "");
  if (at < 0) return line.length > room * 2 ? `${line.slice(0, room * 2)}…` : line;
  const start = Math.max(0, at - room);
  const end = Math.min(line.length, at + (words[0]?.length ?? 0) + room);
  return `${start > 0 ? "…" : ""}${line.slice(start, end)}${end < line.length ? "…" : ""}`;
};

/** A spread's caption for a hit: `p. 12–13 · title`, a cover by its format (and title) */
export const spreadWhere = (spread: SearchSpread): string => {
  const format = formatLabelOf(spread);
  const caption = captionOf(spread);
  return format ? [format, caption].filter(Boolean).join(" · ") : `p. ${caption || pagesOf(spread)}`;
};

/** Every named node of a tree with its path (`[]` = the root) */
const namedNodes = (node: EntityData, path: number[] = []): { name: string; path: number[] }[] => [
  ...(node.name?.trim() ? [{ name: node.name.trim(), path }] : []),
  ...(node.children ?? []).flatMap((child, i) => namedNodes(child, [...path, i])),
];

/** The hits of the query in the book, grouped by kind in `SEARCH_KINDS` order (empty groups left out); at most `limit` per group */
export const searchBook = (spreads: readonly SearchSpread[], query: string, limit = 6): SearchGroup[] => {
  const words = queryWords(query);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  const page = /^\d+$/.test(query.trim()) ? Number(query.trim()) : null;
  for (const spread of spreads) {
    const where = spreadWhere(spread);
    // The spread: its title, its pages, its format – a page number finds the spread it is on
    const onPage = page !== null && page >= spread.firstPage && page <= spread.lastPage;
    const spreadRank = onPage ? 0 : labelRank(`${spread.title} ${pagesOf(spread)} ${formatLabelOf(spread)}`, words);
    if (spreadRank !== null) {
      hits.push({ kind: "spread", key: `spread:${spread.id}`, label: spread.title || where, where, spreadId: spread.id, rank: spreadRank,
        select: { target: null, node: [], onTarget: true, spread: true } });
    }
    for (const entry of spread.entries) {
      const target = entry.target?.imageSrc ? entry.target.id : null;
      const titleRank = labelRank(entry.title, words);
      const body = entry.body ?? "";
      const inBody = titleRank === null && words.every(word => folded(`${entry.title} ${body}`).includes(word)) && words.some(word => folded(body).includes(word));
      if (titleRank === null && !inBody) continue;
      hits.push({ kind: "entry", key: `entry:${entry.id}`, label: entry.title, where: `${where} · p. ${entry.page}`, spreadId: spread.id,
        rank: titleRank ?? 3, ...(inBody ? { excerpt: excerptOf(body, words) } : {}),
        select: { target, node: [], onTarget: true, entry: entry.id } });
    }
    for (const target of spread.targets) {
      if (!target.imageSrc) continue;
      const entry = spread.entries.find(e => e.id === target.entryId);
      const rank = labelRank(target.id, words) ?? (entry && labelRank(entry.title, words) !== null ? 3 : null);
      if (rank !== null) {
        hits.push({ kind: "target", key: `target:${target.id}`, label: target.id, where: `${where}${entry ? ` · ${entry.title}` : ""}`, spreadId: spread.id, rank,
          select: { target: target.id, node: [], onTarget: true } });
      }
      if (!target.entity) continue;
      for (const node of namedNodes(target.entity)) {
        const nodeRank = labelRank(node.name, words);
        if (nodeRank === null) continue;
        hits.push({ kind: "node", key: `node:${target.id}:${node.path.join(".")}`, label: node.name, where: `${where} · ${target.id}`, spreadId: spread.id,
          rank: nodeRank, select: { target: target.id, node: node.path, onTarget: false } });
      }
    }
  }
  return SEARCH_KINDS.flatMap(kind => {
    const ofKind = hits.filter(hit => hit.kind === kind);
    if (!ofKind.length) return [];
    // A stable sort: the same rank stays in book order
    const ranked = ofKind.map((hit, i) => ({ hit, i })).sort((a, b) => a.hit.rank - b.hit.rank || a.i - b.i).map(({ hit }) => hit);
    return [{ kind, label: SEARCH_KIND_LABELS[kind], hits: ranked.slice(0, limit), more: Math.max(0, ranked.length - limit) }];
  });
};

/** The hits in the order the list shows them: ↑ ↓ walk this */
export const flatHits = (groups: readonly SearchGroup[]): SearchHit[] => groups.flatMap(group => group.hits);

/** ↑ ↓ from `index` (-1 = none yet): wraps around */
export const stepHit = (count: number, index: number, by: -1 | 1): number => (count ? (index < 0 ? (by > 0 ? 0 : count - 1) : (index + by + count) % count) : -1);
