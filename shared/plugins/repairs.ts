import type { PluginFile } from "../types/plugins";
import type { PluginSources, PluginTypeProblem } from "./type-check";

/**
 * Known faults of plugin code and their repairs (#366): code the editor itself once wrote wrongly, which the type check
 * (`type-check.ts`) refuses before a publish. Each fault has a **fingerprint** – the exact text the editor wrote, found once
 * in the file – and the type error it gives; its repair is a mechanical change of that text. A repair is offered only
 * when the fingerprint matches exactly, the plugin has the fault's error in that file, and the repaired files type-check
 * without it (`verifiedRepair`); anything else is left as it is – a person fixes it in the Code tab. Nothing here saves:
 * the publish dialog's and the Code tab's **Repair** and `osct plugins check --repair` save the repaired files as a normal
 * save, when a person asks for it.
 */
export interface KnownFault {
  id: string;
  /** What is wrong, in a few words – the publish dialog, the Code tab and the CLI name it */
  title: string;
  /** What Repair changes */
  change: string;
  /** The type error's message the fault gives (a part of it) */
  message: string;
  /** Whether a type error is this fault's: its message, where the fingerprint puts it */
  gives(problem: PluginTypeProblem, text: string): boolean;
  /** The file's text repaired; null when the fingerprint is not found exactly once */
  fix(text: string): string | null;
}

/**
 * *Make it code*'s wrapper before 6.17.1: code made from a plugin's node type copies the plugin and re-registers its node
 * type through a wrapper that passes the copied build on as `build` – the new spec does not fit that build's type, so the
 * type check refuses it ("'S' could be instantiated with a different subtype of constraint 'NodeTypeSpec'"). The repair
 * passes it on as `build as never`, as *Make it code* writes it since.
 */
const MADE_CODE_HEADER = ' * Made with "make it code" from the node type "';
const MADE_CODE_ERROR = "could be instantiated with a different subtype of constraint 'NodeTypeSpec'";
const MADE_CODE_WRAPPER =
  /(\n {4}registerNodeType: \(copiedType, _spec, build\) => \{\n {6}if \(copiedType !== "[A-Za-z][A-Za-z0-9]*"\) return;\n {6}api\.registerNodeType\("[A-Za-z][A-Za-z0-9]*", \{\n[\s\S]*?\n {6}\}, )build(\);\n {4}\},\n {4}registerComponent: \(\) => undefined,)/g;

/** The 1-based line a position of a text is on */
const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

export const MADE_CODE_BUILD: KnownFault = {
  id: "made-code-build",
  title: "made with Make it code before 6.17.1 – its node type's build does not fit the new spec",
  change: "passes the copied build on as `build as never` (the end of its registerNodeType wrapper), as Make it code writes it now",
  message: MADE_CODE_ERROR,
  gives(problem, text) {
    if (!problem.message.includes(MADE_CODE_ERROR)) return false;
    // The error is on the wrapper's own registerNodeType call
    const matches = [...text.matchAll(MADE_CODE_WRAPPER)];
    if (matches.length !== 1) return false;
    const call = (matches[0].index ?? 0) + matches[0][1].indexOf("api.registerNodeType(");
    return problem.line === lineAt(text, call);
  },
  fix(text) {
    if (!text.includes(MADE_CODE_HEADER)) return null;
    const matches = [...text.matchAll(MADE_CODE_WRAPPER)];
    if (matches.length !== 1) return null;
    return text.replace(MADE_CODE_WRAPPER, "$1build as never$2");
  },
};

/** Every known fault, the first that applies wins */
export const KNOWN_FAULTS: readonly KnownFault[] = [MADE_CODE_BUILD];

/** A repair for a plugin: the fault, the files it changes, the plugin's files repaired */
export interface PluginRepair {
  plugin: string;
  fault: KnownFault;
  /** The names of the files it changes */
  changed: string[];
  /** Every file of the plugin, the changed ones repaired */
  files: PluginFile[];
}

/**
 * The repair a plugin's type errors call for, unchecked: the first known fault whose error the plugin has, with every file
 * that has it repaired – null when no fault applies or a file's fingerprint does not match exactly
 */
export const repairFor = (source: PluginSources, problems: readonly PluginTypeProblem[], faults: readonly KnownFault[] = KNOWN_FAULTS): PluginRepair | null => {
  const own = problems.filter(p => p.plugin === source.id);
  for (const fault of faults) {
    const names = [...new Set(own.filter(p => fault.gives(p, source.files.find(f => f.name === p.file)?.text ?? "")).map(p => p.file))];
    if (!names.length) continue;
    const fixed = new Map<string, string>();
    for (const name of names) {
      const text = fault.fix(source.files.find(f => f.name === name)?.text ?? "");
      if (text === null) break;
      fixed.set(name, text);
    }
    if (fixed.size !== names.length) continue;
    return { plugin: source.id, fault, changed: names, files: source.files.map(f => (fixed.has(f.name) ? { name: f.name, text: fixed.get(f.name)! } : f)) };
  }
  return null;
};

/** A repair checked: what is left of the plugin's type errors once repaired (another fault, or none) */
export interface VerifiedRepair extends PluginRepair {
  remaining: PluginTypeProblem[];
}

/**
 * The repair a plugin's type errors call for, **checked**: the repaired files type-checked again (`check`, the shared type
 * check in either runtime) – offered only when the fault's error is gone. `remaining` are the plugin's other errors.
 */
export const verifiedRepair = async (
  source: PluginSources,
  problems: readonly PluginTypeProblem[],
  check: (sources: readonly PluginSources[]) => PluginTypeProblem[] | Promise<PluginTypeProblem[]>,
  faults: readonly KnownFault[] = KNOWN_FAULTS,
): Promise<VerifiedRepair | null> => {
  const repair = repairFor(source, problems, faults);
  if (!repair) return null;
  const after = (await check([{ id: source.id, files: repair.files }])).filter(p => p.plugin === source.id);
  // The fault's error is gone from the files it changed, and no other error came into them
  const changedBefore = problems.filter(p => p.plugin === source.id && repair.changed.includes(p.file));
  const faultBefore = changedBefore.filter(p => p.message.includes(repair.fault.message)).length;
  const changedAfter = after.filter(p => repair.changed.includes(p.file));
  if (changedAfter.some(p => p.message.includes(repair.fault.message)) || changedAfter.length > changedBefore.length - faultBefore) return null;
  return { ...repair, remaining: after };
};
