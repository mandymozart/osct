<script lang="ts">
  import { BEHAVIOUR_SCOPES, VARIABLE_TYPES, type BehaviourScope, type VariableInfo, type VariableType } from "@engine/types";
  import { logicEdit } from "#lib/logic-edit.svelte.js";
  import {
    declarationProblems, formatDefault, parseDefault, renamed, retyped, variableRows, withDeclaration, withoutDeclaration, type Declarations, type VariableRow,
  } from "#lib/variables-edit.js";
  import Icon from "#lib/components/Icon.svelte";

  /**
   * The experience's **variables** (content schema 5.0, #334 B7): per declared variable its name, type, the scope a set
   * without its own writes (none: the scene) and its default (the value before anything sets it); then the variables only
   * **inferred** from their first set, each with **declare**. A new one is added by name and type. Every change is checked
   * first (`declarationProblems`, B8) – a bad name, a name twice, a default of another type is refused with the reason,
   * never saved – and saves itself (`PUT …/variables`, `logicEdit`).
   */
  let { types }: { types: ReadonlyMap<string, VariableInfo> } = $props();

  const declared = $derived(logicEdit.declared());
  const rows = $derived(variableRows(declared, types));
  let problem = $state<string | null>(null);
  let newName = $state("");
  let newType = $state<VariableType>("boolean");

  /** Save the declarations – or refuse them with the reason */
  const save = (next: Declarations | null): boolean => {
    const problems = declarationProblems(next);
    if (problems.length) {
      problem = `Not saved – ${problems.join("; ")}.`;
      return false;
    }
    problem = null;
    logicEdit.setVariables(next);
    return true;
  };
  const declaration = (row: VariableRow) => ({ type: row.type, ...(row.scope ? { scope: row.scope } : {}), ...(row.default !== undefined ? { default: row.default } : {}) });
  const setDefault = (row: VariableRow, text: string) => {
    const parsed = parseDefault(row.type, text);
    if ("problem" in parsed) {
      problem = `Not saved – the default of ${row.name} is ${parsed.problem}.`;
      return;
    }
    const { default: _old, ...rest } = declaration(row);
    save(withDeclaration(declared, row.name, parsed.value === undefined ? rest : { ...rest, default: parsed.value }));
  };
  const rename = (row: VariableRow, name: string) => {
    if (name === row.name) return;
    if (declared?.[name]) {
      problem = `Not saved – ${name} is declared already.`;
      return;
    }
    save(renamed(declared ?? {}, row.name, name));
  };
  const add = () => {
    const name = newName.trim();
    if (declared?.[name]) {
      problem = `Not saved – ${name} is declared already.`;
      return;
    }
    if (save(withDeclaration(declared, name, { type: newType }))) newName = "";
  };
</script>

{#each rows as row (row.name)}
  {#if row.declared}
    <div class="row top" data-help-name="Variable {row.name}" data-help="A declared variable: its name, its type (a set or a condition of another type is a problem), the scope a set without its own scope writes (none: the scene) and its default – the value it has before anything sets it. The cross removes the declaration (the variable then takes the type of its first set).">
      <span class="controls line">
        <input class="field name code" aria-label="Name of {row.name}" spellcheck="false" value={row.name} onchange={e => rename(row, (e.currentTarget as HTMLInputElement).value.trim())} />
        <select class="field type" aria-label="Type of {row.name}" value={row.type}
          onchange={e => save(withDeclaration(declared, row.name, retyped(declaration(row), (e.currentTarget as HTMLSelectElement).value as VariableType)))}>
          {#each VARIABLE_TYPES as type (type)}<option value={type}>{type}</option>{/each}
        </select>
        <select class="field scope" aria-label="Scope of {row.name}" value={row.scope ?? ""}
          onchange={e => { const scope = (e.currentTarget as HTMLSelectElement).value as BehaviourScope | ""; const { scope: _old, ...rest } = declaration(row); save(withDeclaration(declared, row.name, scope ? { ...rest, scope } : rest)); }}>
          <option value="">scene (default)</option>
          {#each BEHAVIOUR_SCOPES as scope (scope)}<option value={scope}>{scope}</option>{/each}
        </select>
        {#if row.type === "boolean"}
          <select class="field value" aria-label="Default of {row.name}" value={formatDefault(row.default)} onchange={e => setDefault(row, (e.currentTarget as HTMLSelectElement).value)}>
            <option value="">no default</option><option value="true">true</option><option value="false">false</option>
          </select>
        {:else}
          <input class="field value code" aria-label="Default of {row.name}" placeholder="no default" spellcheck="false" value={formatDefault(row.default)}
            onchange={e => setDefault(row, (e.currentTarget as HTMLInputElement).value)} />
        {/if}
        <button type="button" class="icon-button" aria-label="Remove the declaration of {row.name}" title="Remove the declaration" onclick={() => save(withoutDeclaration(declared, row.name))}><Icon name="close" /></button>
      </span>
    </div>
  {:else}
    <div class="row" data-help-name="Inferred {row.name}" data-help="A variable nobody declared: it takes the type of its first set. Declare fixes its type here (and lets you give it a scope and a default).">
      <span class="controls line">
        <span class="name code inferred">{row.name}</span>
        <span class="small muted grow">{row.type} · inferred</span>
        <button type="button" class="pill framed" onclick={() => save(withDeclaration(declared, row.name, { type: row.type }))}>declare</button>
      </span>
    </div>
  {/if}
{:else}
  <p class="small muted">No variable yet – a rule's set makes one, or declare one here.</p>
{/each}

<div class="row" data-help-name="Declare a variable" data-help="Declares a variable by name (camelCase letters and digits) and type.">
  <span class="controls line">
    <input class="field name code" aria-label="New variable's name" placeholder="name" spellcheck="false" bind:value={newName} onkeydown={e => { if (e.key === "Enter" && newName.trim()) add(); }} />
    <select class="field type" aria-label="New variable's type" bind:value={newType}>
      {#each VARIABLE_TYPES as type (type)}<option value={type}>{type}</option>{/each}
    </select>
    <button type="button" class="pill framed" disabled={!newName.trim()} onclick={add}>+ variable</button>
  </span>
</div>
{#if problem}<p class="small danger" role="alert">{problem}</p>{/if}

<style>
  .line { flex-wrap: wrap; gap: .25rem; width: 100%; }
  .row.top { align-items: start; }
  .field { padding: 0 .375rem; }
  .code { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); }
  .name { flex: 1 1 5rem; min-width: 4rem; }
  .type { flex: 0 1 5.5rem; min-width: 4.5rem; }
  .scope { flex: 0 1 6.5rem; min-width: 5rem; }
  .value { flex: 1 1 4rem; min-width: 3.5rem; }
  .inferred { line-height: var(--control-height); flex: none; }
  .grow { flex: 1; line-height: var(--control-height); }
</style>
