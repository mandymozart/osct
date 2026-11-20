<script lang="ts">
  import { errorText, renameIds, type RenameIdsReport } from "#lib/api.js";
  import { canApply, reportLines } from "#lib/rename-ids.js";

  /**
   * The admin page's **Ids without leading zeros** (#63, docs/admin.md): the one-off rename of zero-padded ids in the
   * database (`s004-005` → `s4-5`, `p004-1` → `p4-1`) – `POST /admin/rename-ids`, the same as
   * `server/deploy/rename-ids.php` for a host without a shell. A dry run first; Apply only after one without collisions.
   */

  let dryRun = $state<RenameIdsReport | null>(null);
  let applied = $state<RenameIdsReport | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const run = async (apply: boolean) => {
    if (apply) {
      const ids = dryRun?.experiences.reduce((sum, e) => sum + e.ids, 0) ?? 0;
      if (!confirm(`Rename ${ids} ids in the database? Readers' progress starts over, and this cannot be undone here.`)) return;
    }
    busy = true;
    error = null;
    try {
      const report = await renameIds(apply);
      if (apply) {
        applied = report;
        dryRun = null;
      } else {
        dryRun = report;
        applied = null;
      }
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  };

  const shown = $derived(applied ?? dryRun);
</script>

<section class="rename">
  <h2>Ids without leading zeros (#63)</h2>
  <p class="muted small">
    Renames the zero-padded ids once – <code>s004-005</code> → <code>s4-5</code>, <code>p004-1</code> → <code>p4-1</code> – in
    scenes, entries, targets, entities, links and the change log. File paths, published versions and plugin code stay;
    readers' progress starts over. Run the dry run first.
  </p>
  <div class="buttons">
    <button type="button" class="pill framed" onclick={() => run(false)} disabled={busy}>Dry run</button>
    <button type="button" class="pill primary" onclick={() => run(true)} disabled={busy || !canApply(dryRun)}>Apply</button>
  </div>
  {#if error}<p class="danger">{error}</p>{/if}
  {#if shown}
    <div class="report">
      <p class="small">{shown.apply ? "Applied" : "Dry run – nothing written"}{shown.refused ? ` · ${shown.refused} refused` : ""}</p>
      {#each shown.experiences as experience, i (experience.experience)}
        <div class="experience">
          <p>{reportLines(shown)[i]}</p>
          {#if experience.samples.length}
            <p class="muted small">{experience.samples.map(s => `${s.from} → ${s.to}`).join(" · ")}{experience.ids > experience.samples.length ? " · …" : ""}</p>
          {/if}
          {#each experience.collisions as collision (collision)}<p class="small">Refused: {collision}</p>{/each}
        </div>
      {/each}
      {#if shown.plugins.length}
        <p class="muted small">Plugin code that names a padded id (not rewritten – check it in the Code tab): {shown.plugins.join(", ")}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  h2 { font-size: var(--text-size); font-weight: 600; margin: 1.5rem 0 .5rem; }
  .buttons { display: flex; gap: .25rem; margin: .25rem 0; }
  .report { border-top: 1px solid var(--line); margin-top: .5rem; padding-top: .25rem; }
  .experience { padding: .25rem 0; border-bottom: 1px solid var(--line); }
  .experience p { margin: 0; }
  code { font-size: var(--text-small); }
</style>
