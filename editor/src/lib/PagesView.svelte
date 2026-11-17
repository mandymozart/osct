<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { addMatter, errorText, type BookPage, type BookTree, type MatterResult } from "#lib/api.js";
  import { library } from "#lib/library.svelte.js";
  import { pageImages } from "#lib/page-images.svelte.js";
  import { pageKey } from "@shared/api/page-names";
  import { MATTER_MAX } from "@shared/api/editor";
  import type { StageLayout } from "#lib/stage/stage-layout.js";
  import { assetUrl } from "#lib/sheet-preview.js";
  import { bulkClashes, bulkRows, layoutHalfOf, pageByKey, pageTitle, printFormatOf, setItem, type BulkRow } from "#lib/pages-view.js";
  import Icon from "#lib/components/Icon.svelte";

  /**
   * The book's pages (#251, docs/editor.md "Pages"): every page in book order – the covers, the front matter, 1…N, the
   * back matter, and the unnumbered half next to a single page – each with the picture the stage shows for it: its page
   * image when it has one, else the layout's half of its sheet, else nothing. A page image is a Library image that wins
   * over the layout for that page in the editor only (the reader never shows it). Per page: Upload, pick from the
   * Library, Move to another page, Rename, Remove (back to the layout). **Upload many**: dropped or picked files are
   * matched to pages by their names and shown as a list to correct; nothing is uploaded or set before Apply.
   * Above the list, the **print format**: the front and back matter the book is missing against its layout (or the numbers
   * typed), added in one step – a print-first book too (`POST …/matter`).
   */
  let { bookId, tree, layout, assetsBase, onspreadschanged }: {
    bookId: string;
    tree: BookTree;
    layout: StageLayout | null;
    assetsBase: string;
    /** The matter added spreads: the page reads the book again */
    onspreadschanged: () => Promise<void>;
  } = $props();

  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  onMount(() => {
    void pageImages.load(bookId);
    if (library.bookId !== bookId) void library.load(bookId);
  });

  const spreadsById = $derived(Object.fromEntries(tree.spreads.map(spread => [spread.id, spread])));
  const images = $derived(library.ofKinds(["image"]));

  // ── the print format: what the book misses (#296 matter, the back cover after it) ──
  let front = $state(2);
  let back = $state(2);
  let lastPage = $state<number | null>(null);
  /** The layout the numbers were read from: a layout that arrives later fills them again and checks */
  let formatFrom: StageLayout | null | undefined = undefined;
  $effect(() => {
    const from = layout;
    if (from === formatFrom) return;
    formatFrom = from;
    const format = printFormatOf(from);
    untrack(() => {
      front = format.front;
      back = format.back;
      lastPage = format.lastPage ?? null;
      // Checked by itself against a layout; a book without one is checked when asked (its format is a guess)
      if (from) void checkMatter();
      else plan = null;
    });
  });
  let plan = $state<MatterResult["plan"] | null>(null);
  const missing = $derived(!!plan && (plan.create.length > 0 || !!plan.moveBackCover || plan.entries.length > 0));
  const matterBody = () => ({ front, back, ...(lastPage !== null && Number.isInteger(lastPage) ? { lastPage } : {}) });
  async function checkMatter() {
    error = null;
    try {
      plan = (await addMatter(bookId, matterBody())).plan;
    } catch (e) {
      plan = null;
      error = errorText(e);
    }
  }
  const applyMatter = async () => {
    busy = true;
    error = null;
    try {
      const result = await addMatter(bookId, { ...matterBody(), apply: true });
      notice = result.applied ? `Added ${result.plan.create.length} spread${result.plan.create.length === 1 ? "" : "s"}${result.plan.moveBackCover ? `, the back cover moved to page ${result.plan.moveBackCover.to}` : ""}.` : "Nothing to add.";
      await onspreadschanged();
      await pageImages.load(bookId);
      await checkMatter();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  };

  // ── one page's actions ──
  let uploadInput = $state<HTMLInputElement>();
  let uploadFor = $state<BookPage | null>(null);
  let open = $state<{ key: string; action: "library" | "move" | "rename" } | null>(null);
  let renameTo = $state("");
  const toggle = (page: BookPage, action: "library" | "move" | "rename") => {
    const key = pageKey(page);
    open = open?.key === key && open.action === action ? null : { key, action };
    if (open?.action === "rename") renameTo = pageImages.of(page)?.name ?? "";
  };
  const run = async (work: () => Promise<void>, done: string) => {
    busy = true;
    error = null;
    try {
      await work();
      notice = done;
      open = null;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  };
  const uploadOne = (page: BookPage) => {
    uploadFor = page;
    uploadInput?.click();
  };
  const onUploadOne = (file: File) => {
    const page = uploadFor;
    uploadFor = null;
    if (!page) return;
    void run(async () => {
      const asset = await library.upload(bookId, file);
      await pageImages.save(bookId, [setItem(page, asset.url, file.name)]);
    }, `${file.name} is the image of ${page.label}`);
  };
  const pickFor = (page: BookPage, url: string) => {
    const asset = images.find(a => a.url === url);
    if (asset) void run(() => pageImages.save(bookId, [setItem(page, asset.url)]), `${asset.name} is the image of ${page.label}`);
  };
  const moveTo = (page: BookPage, key: string) => {
    const target = pageByKey(pageImages.pages, key);
    if (target) void run(() => pageImages.save(bookId, [{ page: target.page, facing: target.facing, from: { page: page.page, facing: page.facing } }]), `moved to ${target.label}`);
  };
  const rename = (page: BookPage) => {
    const name = renameTo.trim();
    if (name) void run(() => pageImages.save(bookId, [{ page: page.page, facing: page.facing, name }]), `renamed to ${name}`);
  };
  const remove = (page: BookPage) => void run(() => pageImages.save(bookId, [{ page: page.page, facing: page.facing, url: null }]), `${page.label} shows the layout again`);

  // ── upload many: the proposal, corrected, then applied ──
  let manyInput = $state<HTMLInputElement>();
  let rows = $state<BulkRow[]>([]);
  let dragging = $state(false);
  const clashes = $derived(bulkClashes(rows));
  const chosen = $derived(rows.filter(row => row.key));
  const propose = (files: FileList | File[]) => {
    const pictures = [...files].filter(file => /\.(jpe?g|png|webp)$/i.test(file.name));
    rows = bulkRows(pictures, pageImages.pages);
    notice = pictures.length < files.length ? `${files.length - pictures.length} file(s) left out – page images are JPEG, PNG or WebP` : null;
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragging = false;
    if (event.dataTransfer?.files.length) propose(event.dataTransfer.files);
  };
  let progress = $state<string | null>(null);
  const applyMany = async () => {
    if (clashes.size || !chosen.length) return;
    busy = true;
    error = null;
    try {
      const items = [];
      for (const [i, row] of chosen.entries()) {
        const page = pageByKey(pageImages.pages, row.key);
        if (!page) continue;
        progress = `uploading ${i + 1} of ${chosen.length}: ${row.file.name}`;
        const asset = await library.upload(bookId, row.file);
        items.push(setItem(page, asset.url, row.file.name));
      }
      progress = "setting the page images…";
      await pageImages.save(bookId, items);
      notice = `${items.length} page image${items.length === 1 ? "" : "s"} set`;
      rows = [];
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
      progress = null;
    }
  };

  const otherPages = (page: BookPage) => pageImages.pages.filter(p => pageKey(p) !== pageKey(page));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="pages" class:dragging aria-label="Pages" ondragover={e => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop}>
  <div class="bar">
    <p class="muted small intro">One image per page wins over the print layout's sheet for that page on the stage and the spread cards – in the editor only, the reader never shows it.</p>
    <button type="button" class="pill framed" disabled={busy} onclick={() => manyInput?.click()}
      data-help-name="Upload many" data-help="Pick or drop many pictures: each is matched to a page by its name (P012…, p12, 012, page-12; cover, back-cover; F1… and B1… for the front and back matter; start-1… and end-1… in print order; P001-facing for the unnumbered half next to page 1). The list shows the proposal to correct – nothing is uploaded before Apply.">
      <Icon name="plus" /> Upload many…</button>
    <input bind:this={manyInput} type="file" accept=".jpg,.jpeg,.png,.webp" multiple hidden
      onchange={e => { const f = (e.currentTarget as HTMLInputElement).files; if (f?.length) propose(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
    <input bind:this={uploadInput} type="file" accept=".jpg,.jpeg,.png,.webp" hidden
      onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) onUploadOne(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
  </div>
  {#if dragging}<p class="drop small" aria-live="polite">drop pictures – each goes to the page its name says</p>{/if}
  {#if error}<p class="small danger">{error}</p>{/if}
  {#if pageImages.error}<p class="small danger">{pageImages.error}</p>{/if}
  {#if progress}<p class="small muted" aria-live="polite">{progress}</p>{:else if notice}<p class="small muted" aria-live="polite">{notice}</p>{/if}

  <div class="format">
    <span class="section-label">print format</span>
    <label class="small">front matter <input class="field num" type="number" min="0" max={MATTER_MAX} bind:value={front} /> sheets</label>
    <label class="small">back matter <input class="field num" type="number" min="0" max={MATTER_MAX} bind:value={back} /> sheets</label>
    <label class="small">last printed page <input class="field num" type="number" bind:value={lastPage} placeholder="as the spreads" /></label>
    <button type="button" class="text-link" disabled={busy} onclick={() => void checkMatter()}
      data-help="Compares the book's spreads with its print format: the front and back matter sheets (from the layout when the book has one) and the last printed page.">Check</button>
    {#if plan && !missing}<span class="small muted">the book has every page</span>{/if}
  </div>
  {#if plan && missing}
    <div class="missing">
      <p class="small">The book is missing pages of its print format:</p>
      <ul class="small">
        {#each plan.create as spread (spread.id)}
          <li>{spread.title} – {spread.matter ? `${spread.matter} matter, internal pages ${spread.firstPage}…${spread.lastPage}` : `page ${spread.firstPage}`} <span class="muted">({spread.id})</span></li>
        {/each}
        {#if plan.moveBackCover}<li>the back cover moves from page {plan.moveBackCover.from} to {plan.moveBackCover.to}, after the back matter</li>{/if}
        {#each plan.entries as entry (entry.id)}<li>the entry {entry.id} goes to {entry.spread}, page {entry.page}</li>{/each}
      </ul>
      <button type="button" class="pill primary" disabled={busy} onclick={() => void applyMatter()}
        data-help="Adds these spreads to the draft (a print-first book too – they are the printed book's, only missing) and moves the back cover after the back matter. Every change is in the book's change log.">Add the missing pages</button>
    </div>
  {/if}

  {#if rows.length}
    <div class="bulk">
      <span class="section-label">upload many · {chosen.length} of {rows.length} files</span>
      <table class="list">
        <thead><tr><th>file</th><th>page</th><th></th></tr></thead>
        <tbody>
          {#each rows as row, i (i)}
            {@const current = row.key ? pageByKey(pageImages.pages, row.key) : undefined}
            <tr class:skip={!row.key}>
              <td class="name" title={row.file.name}>{row.file.name}</td>
              <td>
                <select class="field" aria-label="The page of {row.file.name}" bind:value={rows[i].key}>
                  <option value="">skip</option>
                  {#each pageImages.pages as page (pageKey(page))}<option value={pageKey(page)}>{pageTitle(page)}</option>{/each}
                </select>
              </td>
              <td class="small">
                {#if row.key && clashes.has(row.key)}<span class="danger">two files for this page</span>
                {:else if current && pageImages.of(current)}<span class="muted">replaces {pageImages.of(current)?.name}</span>
                {:else if row.note && !row.key}<span class="muted">{row.note}</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="actions">
        <button type="button" class="pill primary" disabled={busy || !chosen.length || clashes.size > 0} onclick={() => void applyMany()}>Apply</button>
        <button type="button" class="text-link" disabled={busy} onclick={() => (rows = [])}>cancel</button>
      </div>
    </div>
  {/if}

  {#if pageImages.loading && !pageImages.pages.length}
    <p class="muted small">Loading…</p>
  {:else}
    <ul class="grid">
      {#each pageImages.pages as page (pageKey(page))}
        {@const image = pageImages.of(page)}
        {@const half = image ? null : layoutHalfOf(page, spreadsById[page.spread], layout, assetsBase)}
        {@const key = pageKey(page)}
        <li class="card" class:own={!!image}>
          <span class="thumb" style:aspect-ratio={layout ? layout.page.width / layout.page.height : 230 / 320}>
            {#if image}
              <img src={assetUrl(assetsBase, image.url)} alt="" loading="lazy" decoding="async" />
            {:else if half}
              <img class="half {half.part}" src={half.url} alt="" loading="lazy" decoding="async" />
            {/if}
          </span>
          <div class="name" title={pageTitle(page)}>{pageTitle(page)}</div>
          <div class="small muted file" title={image?.name ?? ""}>{image ? image.name : half ? "layout" : "empty"}</div>
          <div class="actions">
            <button type="button" class="text-link" disabled={busy} onclick={() => uploadOne(page)}>{image ? "Replace…" : "Upload…"}</button>
            <button type="button" class="text-link" disabled={busy} aria-expanded={open?.key === key && open.action === "library"} onclick={() => toggle(page, "library")}>Library…</button>
            {#if image}
              <button type="button" class="text-link" disabled={busy} aria-expanded={open?.key === key && open.action === "move"} onclick={() => toggle(page, "move")}>Move…</button>
              <button type="button" class="text-link" disabled={busy} aria-expanded={open?.key === key && open.action === "rename"} onclick={() => toggle(page, "rename")}>Rename…</button>
              <button type="button" class="text-link" disabled={busy} title="Back to the layout's sheet" onclick={() => remove(page)}>Remove</button>
            {/if}
          </div>
          {#if open?.key === key && open.action === "library"}
            <select class="field" aria-label="A Library image for {page.label}" onchange={e => pickFor(page, (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">{images.length ? "choose an image…" : "no images in the Library"}</option>
              {#each images as asset (asset.id)}<option value={asset.url}>{asset.name}</option>{/each}
            </select>
          {:else if open?.key === key && open.action === "move"}
            <select class="field" aria-label="Move the image of {page.label} to" onchange={e => moveTo(page, (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">move to…</option>
              {#each otherPages(page) as other (pageKey(other))}<option value={pageKey(other)}>{pageTitle(other)}{pageImages.of(other) ? " (replaces its image)" : ""}</option>{/each}
            </select>
          {:else if open?.key === key && open.action === "rename"}
            <form class="rename" onsubmit={e => { e.preventDefault(); rename(page); }}>
              <input class="field" aria-label="The name of the image of {page.label}" bind:value={renameTo} maxlength="255" />
              <button type="submit" class="text-link" disabled={!renameTo.trim()}>save</button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .pages { position: relative; display: flex; flex-direction: column; gap: .5rem; }
  .pages.dragging { outline: 1px dashed var(--text); outline-offset: .25rem; }
  .drop { position: absolute; inset: 0; z-index: 1; margin: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; background: var(--surface); opacity: .92; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; }
  .intro { flex: 1; min-width: 12rem; margin: 0; }
  .format { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem 1rem; }
  .format .num { width: 4.5rem; }
  .missing, .bulk { display: flex; flex-direction: column; gap: .375rem; padding: .5rem; border: 1px solid var(--line); border-radius: var(--control-radius); }
  .missing p, .missing ul { margin: 0; }
  .missing ul { padding-left: 1.25rem; }
  .missing .pill { align-self: flex-start; }
  .list { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .list th { text-align: left; font-weight: normal; color: var(--muted); font-size: var(--text-small); }
  .list th, .list td { padding: .2rem .25rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .list th:nth-child(1) { width: 40%; }
  .list th:nth-child(2) { width: 30%; }
  .list select { width: 100%; }
  .list tr.skip .name { color: var(--muted); }
  .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); }
  .card { display: flex; flex-direction: column; gap: .2rem; padding: .375rem; border: 1px solid var(--line); border-radius: var(--control-radius); min-width: 0; }
  .card.own { border-color: var(--text); }
  .thumb { position: relative; display: block; width: 100%; background: #fff; overflow: hidden; border: 1px solid var(--line); box-sizing: border-box; }
  .thumb img { display: block; width: 100%; height: 100%; object-fit: fill; }
  .thumb img.half { position: absolute; top: 0; width: 200%; max-width: none; }
  .thumb img.half.left { left: 0; }
  .thumb img.half.right { left: -100%; }
  .thumb img.half.whole { width: 100%; left: 0; }
  .name, .file { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .125rem .5rem; }
  .rename { display: flex; gap: .25rem; }
  .rename .field { flex: 1; min-width: 0; }
  .card select { width: 100%; }
</style>
