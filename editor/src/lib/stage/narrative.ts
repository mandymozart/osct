import type { Target } from "@engine/types";
import type { VarScope, VarValue } from "@engine/scene";

/**
 * The Stage panel's narrative controls, three-free: a variable's type, which control edits it and how (a manual `set`
 * to test a branch – the write itself goes through the plugin API, `Stage.setVar`), and the spread's targets as the
 * tap buttons list them.
 */

/** The plugin API's value types (`VarValue`): JSON scalars */
export const VAR_TYPES = ["boolean", "number", "string"] as const;
export type VarType = (typeof VAR_TYPES)[number];

/** A variable as the panel lists it: the plugin API's snapshot (`allVars`) with the value's type */
export interface PanelVar {
  scope: VarScope;
  name: string;
  value: VarValue;
  type: VarType;
}

export const varType = (value: VarValue): VarType => (typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string");

export const withTypes = (vars: ReadonlyArray<{ scope: VarScope; name: string; value: VarValue }>): PanelVar[] =>
  vars.map(v => ({ ...v, type: varType(v.value) }));

/** What a field shows for a value: a string as it is, a number or a boolean as text */
export const formatVar = (value: VarValue): string => String(value);

/** The scrub step for a number variable: as fine as its decimals (at most 0.001), 1 for a whole number */
export const numberStep = (value: number): number => {
  const decimals = Math.min(3, (String(value).split(".")[1] ?? "").length);
  return decimals ? Number((10 ** -decimals).toFixed(decimals)) : 1;
};

/** The value a new variable of a type starts with */
export const initialValue = (type: VarType): VarValue => (type === "boolean" ? true : type === "number" ? 0 : "");

/** A tap button: the target, the entry's title as its label, and whether a tap reaches it now */
export interface TapTarget {
  id: string;
  label: string;
  /** Found on the stage and has AR content – the engine taps only such a target */
  tappable: boolean;
}

/** The spread's targets with a printed image, in page order, as the tap row lists them */
export const tapTargets = (
  entries: ReadonlyArray<{ title: string; target?: Target }>,
  found: readonly string[],
  hasEntity: (target: Target) => boolean,
): TapTarget[] =>
  entries
    .map(entry => ({ entry, target: entry.target }))
    .filter((e): e is { entry: { title: string; target: Target }; target: Target } => !!e.target?.imageSrc)
    .map(({ entry, target }) => ({ id: target.id, label: entry.title || target.id, tappable: found.includes(target.id) && hasEntity(target) }));
