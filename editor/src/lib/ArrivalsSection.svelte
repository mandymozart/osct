<script lang="ts">
  import { onMount } from "svelte";
  import { errorText, getEntries, listArrivals, listExperiences, listScenes, type ArrivalSource } from "#lib/api.js";
  import { loadQr, qrModules, qrSvg } from "#lib/qr-svg.js";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * The admin page's **QR codes and links** (#324, docs/admin.md): how many people came to the app from each printed QR
   * code or link with `?s=<source>` – the book's code is `bk1`, the desktop landing page's `lp1`. Per source the
   * arrivals in the chosen window and in all, the first arrivals (browsers that had never arrived before), phone /
   * tablet / desktop, the first and the last day, and a bar per day. A source nobody planned shows up by itself. Counts
   * only: the server keeps no IP and no user.
   */

  /** The codes we printed or placed, by source */
  const KNOWN: Record<string, string> = {
    bk1: "The book – last page",
    lp1: "Desktop landing page",
  };
  const WINDOWS = ["7", "30", "90", "365"] as const;
  type Window = (typeof WINDOWS)[number];
  const WINDOW_LABELS: Record<Window, string> = { "7": "7 days", "30": "30 days", "90": "90 days", "365": "a year" };

  let days = $state<Window>("30");
  let sources = $state<ArrivalSource[] | null>(null);
  let from = $state("");
  let to = $state("");
  let error = $state<string | null>(null);
  let code = $state("");

  const load = async () => {
    error = null;
    try {
      const answer = await listArrivals(Number(days));
      sources = answer.sources;
      from = answer.from;
      to = answer.to;
    } catch (e) {
      error = errorText(e);
      sources = [];
    }
  };
  onMount(() => void load());
  const setDays = (value: Window) => {
    days = value;
    void load();
  };

  /** Every day of the window, oldest first (UTC, as the server counts) */
  const windowDays = $derived.by(() => {
    if (!from || !to) return [] as string[];
    const out: string[] = [];
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
    return out;
  });
  const inWindow = (source: ArrivalSource) => source.recent.reduce((sum, day) => sum + day.arrivals, 0);
  const totals = $derived({
    window: (sources ?? []).reduce((sum, s) => sum + inWindow(s), 0),
    all: (sources ?? []).reduce((sum, s) => sum + s.arrivals, 0),
  });

  /** The bars of a source's days: one per day of the window, scaled to its busiest day */
  const bars = (source: ArrivalSource) => {
    const byDay = new Map(source.recent.map(d => [d.day, d.arrivals]));
    const values = windowDays.map(day => ({ day, arrivals: byDay.get(day) ?? 0 }));
    const max = Math.max(1, ...values.map(v => v.arrivals));
    return { values, max };
  };

  const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  /**
   * **A new code** (#326): a source, where the code leads – the start, Info, a scene, a category's list or an entry (the
   * reader's links, docs/pages.md "Links") – and the address with `?s=` as a QR code in SVG, to copy or download for print
   */
  const appOrigin = typeof location === "undefined" ? "" : location.origin;
  interface Target { path: string; label: string }
  let targets = $state<{ scenes: Target[]; categories: Target[]; entries: Target[] }>({ scenes: [], categories: [], entries: [] });
  let path = $state("/");
  const loadTargets = async () => {
    try {
      const { experiences } = await listExperiences();
      const experience = experiences[0];
      if (!experience) return;
      const [{ scenes }, { entries }] = await Promise.all([listScenes(experience.id), getEntries(experience.id)]);
      const categories = [...new Set(entries.map(e => e.category))].sort();
      targets = {
        scenes: scenes.map(scene => ({ path: `/scene/${encodeURIComponent(scene.id)}`, label: scene.label ? `${scene.label} (${scene.id})` : scene.id })),
        categories: categories.map(category => ({ path: `/entries/${encodeURIComponent(category)}`, label: category })),
        entries: entries.map(entry => ({ path: `/entry/${encodeURIComponent(entry.id)}`, label: `${entry.title || entry.id} (${entry.id})` })),
      };
    } catch {
      // An admin who is no editor: the start and Info only
    }
  };
  onMount(() => void loadTargets());

  const cleanCode = $derived(code.trim().toLowerCase());
  const codeValid = $derived(/^[a-z0-9][a-z0-9-]{0,31}$/.test(cleanCode));
  const codeUrl = $derived(codeValid ? `${appOrigin}${path}?s=${cleanCode}` : "");
  let svg = $state("");
  $effect(() => {
    const url = codeUrl;
    if (!url) {
      svg = "";
      return;
    }
    let current = true;
    loadQr().then(QR => { if (current) svg = qrSvg(qrModules(QR, url)); }).catch(() => { if (current) svg = ""; });
    return () => { current = false; };
  });
  let copied = $state(false);
  const copy = async () => {
    if (!codeUrl) return;
    try {
      await navigator.clipboard.writeText(codeUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  };
  const download = () => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `osct-qr-${cleanCode}${path === "/" ? "" : path.replace(/\//g, "-")}.svg` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
</script>

<section class="arrivals" aria-labelledby="arrivals-title">
  <div class="toolbar">
    <h1 id="arrivals-title">QR codes and links</h1>
    <span class="grow"></span>
    <Segmented options={WINDOWS} value={days} labels={WINDOW_LABELS} label="Window" onchange={setDays} />
  </div>
  <p class="muted small">Arrivals at the app from a printed QR code or a link with <code>?s=</code> – counts only, no IP, no user. A first arrival is a browser that had never arrived before.</p>

  {#if error}<p class="danger">{error}</p>{/if}

  {#if sources === null}
    <p class="muted">Loading…</p>
  {:else if sources.length === 0}
    <p class="muted">No arrivals yet. The book's code is <code>{appOrigin}/?s=bk1</code>.</p>
  {:else}
    <p class="muted small">{totals.window} arrival{totals.window === 1 ? "" : "s"} in the last {WINDOW_LABELS[days]} · {totals.all} in all</p>
    <table class="sources">
      <thead>
        <tr>
          <th>source</th>
          <th class="num" title="Arrivals in the chosen window">{WINDOW_LABELS[days]}</th>
          <th class="num" title="Arrivals since the first one">all</th>
          <th class="num" title="Browsers that had never arrived before">first</th>
          <th title="All arrivals by device: phone · tablet · desktop">phone · tablet · desktop</th>
          <th>seen</th>
          <th class="days">per day</th>
        </tr>
      </thead>
      <tbody>
        {#each sources as source (source.source)}
          {@const chart = bars(source)}
          <tr>
            <td class="name">
              <span class="label">{KNOWN[source.source] ?? "Unknown source"}</span>
              <code class="muted">{source.source}</code>
            </td>
            <td class="num strong" data-label={WINDOW_LABELS[days]}>{inWindow(source)}</td>
            <td class="num" data-label="all">{source.arrivals}</td>
            <td class="num" data-label="first">{source.firstArrivals}</td>
            <td class="devices" data-label="devices">{source.devices.phone} · {source.devices.tablet} · {source.devices.desktop}</td>
            <td class="muted seen" data-label="seen">{shortDate(source.firstDay)}{source.lastDay !== source.firstDay ? ` – ${shortDate(source.lastDay)}` : ""}</td>
            <td class="days" data-label="per day">
              <svg viewBox="0 0 {chart.values.length} 20" preserveAspectRatio="none" role="img" aria-label="Arrivals per day of {source.source}">
                {#each chart.values as value, i (value.day)}
                  {#if value.arrivals}
                    <rect x={i + 0.12} y={20 - (18 * value.arrivals) / chart.max} width="0.76" height={(18 * value.arrivals) / chart.max}><title>{shortDate(value.day)}: {value.arrivals}</title></rect>
                  {/if}
                {/each}
                <line x1="0" x2={chart.values.length} y1="19.75" y2="19.75" />
              </svg>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <div class="make">
    <h2>A new code</h2>
    <p class="muted small">Give each printed code or link its own source – a short code of a–z, 0–9 and dashes (a flyer <code>fl1</code>, a poster <code>po1</code>) –, choose where it leads, and print the QR code. It shows up here with its first arrival.</p>
    <div class="maker">
      <div class="fields">
        <label class="row"><span class="muted small">source</span>
          <input class="field code-field" type="text" bind:value={code} placeholder="fl1" maxlength="32" autocomplete="off" spellcheck="false" /></label>
        <label class="row"><span class="muted small">leads to</span>
          <select class="field" bind:value={path} aria-label="Where the code leads">
            <option value="/">The start</option>
            <option value="/about">Info (about)</option>
            {#if targets.scenes.length}<optgroup label="Scenes">{#each targets.scenes as t (t.path)}<option value={t.path}>{t.label}</option>{/each}</optgroup>{/if}
            {#if targets.categories.length}<optgroup label="Entry lists">{#each targets.categories as t (t.path)}<option value={t.path}>{t.label}</option>{/each}</optgroup>{/if}
            {#if targets.entries.length}<optgroup label="Entries">{#each targets.entries as t (t.path)}<option value={t.path}>{t.label}</option>{/each}</optgroup>{/if}
          </select></label>
        <code class="url" class:muted={!codeUrl}>{codeUrl || `${appOrigin}${path}?s=…`}</code>
        <span class="row">
          <button type="button" class="pill framed" onclick={copy} disabled={!codeUrl}>{copied ? "Copied" : "Copy"}</button>
          <button type="button" class="pill framed" onclick={download} disabled={!svg}>Download SVG</button>
        </span>
      </div>
      <div class="qr" aria-label={codeUrl ? `QR code of ${codeUrl}` : "No code yet"} role="img">
        {#if svg}{@html svg}{:else}<span class="muted small">a source first</span>{/if}
      </div>
    </div>
  </div>
</section>

<style>
  .arrivals { margin: 0 0 2rem; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .25rem; }
  .grow { flex: 1; }
  h1, h2 { font-size: 1rem; font-weight: 600; margin: 0; }
  h2 { font-size: var(--text-size); margin: 1.25rem 0 .25rem; }
  code { font-size: .875em; }
  .sources { width: 100%; border-collapse: collapse; margin: .25rem 0 0; }
  .sources th { text-align: left; font-weight: normal; color: var(--muted); font-size: var(--text-small); letter-spacing: .08em; text-transform: uppercase; padding: .25rem .75rem .25rem 0; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .sources td { padding: .375rem .75rem .375rem 0; border-bottom: 1px solid var(--line); vertical-align: middle; white-space: nowrap; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 600; }
  .name { display: flex; flex-direction: column; gap: .125rem; }
  .name .label { font-weight: 500; }
  .devices { font-variant-numeric: tabular-nums; }
  .days { width: 12rem; }
  .days svg { display: block; width: 12rem; height: 1.5rem; }
  .days rect { fill: currentColor; }
  .days line { stroke: var(--line); stroke-width: .5; vector-effect: non-scaling-stroke; }
  .maker { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1rem 1.5rem; }
  .fields { display: grid; gap: .5rem; flex: 1 1 20rem; min-width: 0; }
  .make .row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .make label.row > span { width: 4.5rem; }
  .make select.field { flex: 1; min-width: 0; max-width: 28rem; }
  .code-field { width: 8rem; }
  .qr { width: 9rem; height: 9rem; display: grid; place-items: center; border: 1px solid var(--line); border-radius: .5rem; background: #fff; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; border-radius: .5rem; }
  .make .url { user-select: all; overflow-wrap: anywhere; }
  @media (max-width: 40rem) {
    .sources thead { display: none; }
    .sources tr { display: grid; grid-template-columns: 1fr; padding: .375rem 0; border-bottom: 1px solid var(--line); }
    .sources td { border: none; padding: .125rem 0; white-space: normal; text-align: left; }
    .sources td[data-label] { display: grid; grid-template-columns: 6rem minmax(0, 1fr); gap: .375rem; align-items: center; }
    .sources td[data-label]::before { content: attr(data-label); color: var(--muted); font-weight: normal; }
    .days, .days svg { width: 100%; }
  }
</style>
