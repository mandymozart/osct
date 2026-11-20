import { BEHAVIOUR_NAME_PATTERN, type BehaviourScope } from "@shared/types/behaviour";
import { valueFits, type VariableDeclaration, type VariableInfo, variablesProblems, type VariableType } from "@shared/types/variables";
import { parseNumber } from "#lib/values.js";

/**
 * The experience's **variables** as the Inspector edits them (content schema 5.0, #334 B7, `shared/types/variables.ts`): a
 * declaration per name – its type, the scope a `set` without its own writes, its default – and the variables only
 * **inferred** from their first set, each with a button to declare it. Pure: the store (`logic-edit.svelte.ts`) saves the
 * result with `PUT …/variables`; a declaration with a problem is refused with the reason (B8), never saved.
 */

export type Declarations = Record<string, VariableDeclaration>;

/** A declared variable or one inferred from its first set, for the Inspector's list */
export interface VariableRow {
  name: string;
  type: VariableType;
  scope?: BehaviourScope;
  default?: string | number | boolean;
  /** Declared in `experience.variables`, or only inferred (`from`: the set it takes its type from) */
  declared: boolean;
  from: string;
}

/** The rows: the declared variables in their order, then the inferred ones by name */
export const variableRows = (declared: Declarations | null | undefined, types: ReadonlyMap<string, VariableInfo>): VariableRow[] => {
  const rows: VariableRow[] = Object.entries(declared ?? {}).map(([name, d]) => ({ name, ...d, declared: true, from: `experience.variables.${name}` }));
  const inferred = [...types.entries()].filter(([name, info]) => !declared?.[name] && !info.from.startsWith("experience.variables."))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, info]): VariableRow => ({ name, type: info.type, declared: false, from: info.from }));
  return [...rows, ...inferred];
};

/** A default typed as text, for a type: a number, a whole number, true / false, any text; empty = none. A wrong one is its reason */
export const parseDefault = (type: VariableType, text: string): { value: string | number | boolean | undefined } | { problem: string } => {
  const trimmed = text.trim();
  if (type === "string") return { value: text === "" ? undefined : text };
  if (!trimmed) return { value: undefined };
  if (type === "boolean") return trimmed === "true" || trimmed === "false" ? { value: trimmed === "true" } : { problem: "true or false" };
  const n = parseNumber(trimmed);
  if (n === null) return { problem: type === "integer" ? "a whole number" : "a number" };
  if (type === "integer" && !Number.isInteger(n)) return { problem: "a whole number – the variable is an integer" };
  return { value: n };
};

/** A default as its field shows it */
export const formatDefault = (value: string | number | boolean | undefined): string => (value === undefined ? "" : String(value));

/** The declarations with one set (added, or replacing the one of that name) – its order kept */
export const withDeclaration = (declared: Declarations | null | undefined, name: string, declaration: VariableDeclaration): Declarations => {
  const clean: VariableDeclaration = { type: declaration.type, ...(declaration.scope ? { scope: declaration.scope } : {}), ...(declaration.default !== undefined ? { default: declaration.default } : {}) };
  return { ...(declared ?? {}), [name]: clean };
};

/** The declarations with one renamed (its place in the order kept) */
export const renamed = (declared: Declarations, from: string, to: string): Declarations =>
  Object.fromEntries(Object.entries(declared).map(([name, d]) => [name === from ? to : name, d]));

/** The declarations without one; null when none is left (the field goes) */
export const withoutDeclaration = (declared: Declarations | null | undefined, name: string): Declarations | null => {
  const { [name]: _gone, ...rest } = declared ?? {};
  return Object.keys(rest).length ? rest : null;
};

/** A type change keeps a default only when it still fits */
export const retyped = (declaration: VariableDeclaration, type: VariableType): VariableDeclaration => {
  const { default: value, ...rest } = declaration;
  return { ...rest, type, ...(value !== undefined && valueFits(type, value) ? { default: value } : {}) };
};

/** Why the declarations cannot be saved (B8): a bad name, a name twice, a default of another type – [] when they can */
export const declarationProblems = (declared: Declarations | null, names: readonly string[] = Object.keys(declared ?? {})): string[] => {
  const problems: string[] = [];
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice) problems.push(`${twice} is declared twice`);
  for (const name of names) if (!BEHAVIOUR_NAME_PATTERN.test(name)) problems.push(`${name || "An empty name"} is no variable name – camelCase letters and digits`);
  if (declared) problems.push(...variablesProblems(declared, "variables").map(p => p.replace(/^variables\./, "")));
  return [...new Set(problems)];
};
