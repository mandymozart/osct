<script lang="ts">
  import { onMount } from "svelte";
  import { API_URL, createApiToken, errorText, getHealth, listApiTokens, renewApiToken, revokeApiToken, type ApiToken } from "#lib/api.js";
  import Segmented from "#lib/components/Segmented.svelte";
  import {
    agentPrompt, ago, apiUrlFor, CLIENT_INFO, CLIENTS, commandLine, day, expiresSoon, FILE_PLACEHOLDER, machineFrom, SERVER_FILE, SERVER_NAME_PLACEHOLDER,
    serverDownloadUrl, serverFileFrom, serverNameFor, snippetFor, tokenNameFor, TOKEN_PLACEHOLDER, type McpClient, type McpSetup,
  } from "#lib/mcp-setup.js";
  import { readStored, writeStored } from "#lib/storage.js";

  /**
   * AI connections on the books page (#142, #273, docs/editor.md "AI connections"), two tabs:
   * - **Connect an AI agent** – pick the agent, copy one prompt into it. The prompt (`agentPrompt`) has the agent download
   *   this instance's server file, add its client's entry and call `whoami`; a token made for it is filled in. With no
   *   token yet, one is made at once (named after the agent and the machine); else one click makes it and copies the
   *   prompt. Everything by hand – the server file, the four values, the client's snippet – folds away under it.
   * - **Existing connections** – the person's tokens: last use, expiry, renew (182 days from now), revoke, and a named one.
   * Every call here is the person's own sign-in; the API refuses them to a token. A token is shown once, never stored.
   */
  type View = "connect" | "existing";
  let view = $state<View>("connect");
  let tokens = $state<ApiToken[] | null>(null);
  let name = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  /** The token just made – in the prompt and the snippets until the page is left; never stored */
  let fresh = $state<{ name: string; token: string } | null>(null);
  /** Made on the Existing tab: its token is shown there once, with a copy button */
  let freshShown = $state(false);
  /** Which copy button just copied (its label says so for a moment) */
  let copied = $state<string | null>(null);
  /** This instance's environment from GET /health (null until known) */
  let env = $state<string | null>(null);

  const CLIENT_KEY = "osct-editor-mcp-client";
  const stored = readStored(CLIENT_KEY);
  let client = $state<McpClient>((CLIENTS as readonly string[]).includes(stored ?? "") ? (stored as McpClient) : "claude-code");
  const pick = (value: McpClient) => {
    client = value;
    writeStored(CLIENT_KEY, value);
  };

  const FILE_KEY = "osct-editor-mcp-file";
  /** What the person typed for the server file (by hand) – the downloaded `osct-mcp.mjs`, a checkout's file or the checkout */
  let fileInput = $state(readStored(FILE_KEY) ?? "");
  const storeFile = () => writeStored(FILE_KEY, fileInput.trim() || null);

  const machine = machineFrom(typeof navigator === "undefined" ? undefined : navigator.platform);
  const apiUrl = typeof location === "undefined" ? API_URL : apiUrlFor(API_URL, location.origin);
  /** The one-file MCP server this instance serves (#272) */
  const download = typeof location === "undefined" ? "/mcp/osct-mcp.mjs" : serverDownloadUrl(location.origin);
  const setup = $derived<McpSetup>({ name: env ? serverNameFor(env) : SERVER_NAME_PLACEHOLDER, api: apiUrl, token: fresh?.token ?? null, file: serverFileFrom(fileInput) });
  const prompt = $derived(agentPrompt(client, setup, download));
  const snippet = $derived(snippetFor(client, setup));
  const values = $derived([
    { key: "name", label: "name", value: setup.name },
    { key: "command", label: "command", value: commandLine(setup) },
    { key: "api", label: "OSCT_API_URL", value: setup.api },
    { key: "token", label: "OSCT_EDITOR_TOKEN", value: setup.token ?? TOKEN_PLACEHOLDER },
  ]);

  const load = async () => {
    try {
      tokens = (await listApiTokens()).tokens;
    } catch (e) {
      error = errorText(e);
    }
  };

  const run = async (action: () => Promise<void>) => {
    busy = true;
    error = null;
    try {
      await action();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  };

  const make = async (tokenName: string) => {
    const made = await createApiToken(tokenName);
    fresh = { name: made.apiToken.name, token: made.token };
    await load();
  };

  /** No token yet: the first one is made right away, so the prompt is ready to copy */
  onMount(async () => {
    getHealth().then(h => (env = h.env), () => (env = null));
    await load();
    if (tokens?.length === 0 && !fresh) await run(() => make(tokenNameFor(client, machine)));
  });

  /** One click: a token for this agent, then the prompt with it goes to the clipboard */
  const makePrompt = () => run(async () => {
    await make(tokenNameFor(client, machine));
    await copy("prompt", agentPrompt(client, setup, download), true);
  });

  const create = (event: SubmitEvent) => {
    event.preventDefault();
    return run(async () => {
      await make(name.trim() || tokenNameFor(client, machine));
      freshShown = true;
      name = "";
    });
  };

  const renew = (token: ApiToken) => run(async () => {
    const { apiToken } = await renewApiToken(token.id);
    tokens = (tokens ?? []).map(t => (t.id === apiToken.id ? apiToken : t));
  });

  const revoke = (token: ApiToken) => {
    if (!confirm(`Revoke "${token.name}"? Every agent using it stops working at once.`)) return;
    return run(async () => {
      await revokeApiToken(token.id);
      tokens = (tokens ?? []).filter(t => t.id !== token.id);
      if (fresh && token.prefix && fresh.token.startsWith(token.prefix.replace(/…$/, ""))) fresh = null;
    });
  };

  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  /** `quiet`: right after an await the browser may refuse – the Copy button is still there, no error */
  const copy = async (key: string, value: string, quiet = false) => {
    try {
      await navigator.clipboard.writeText(value);
      copied = key;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = null), 1600);
    } catch {
      if (!quiet) error = "The browser did not allow copying – select the text and copy it by hand.";
    }
  };
</script>

<section class="ai" aria-label="AI connections">
  <div class="tabs" role="group" aria-label="AI connections">
    <button type="button" class="pill tab" class:on={view === "connect"} aria-pressed={view === "connect"} onclick={() => { view = "connect"; error = null; }}>Connect an AI agent</button>
    <button type="button" class="pill tab" class:on={view === "existing"} aria-pressed={view === "existing"} onclick={() => { view = "existing"; error = null; }}>
      Existing connections{#if tokens?.length}<span class="count">{tokens.length}</span>{/if}</button>
  </div>

  {#if error}<p class="danger small">{error}</p>{/if}

  {#if view === "connect"}
    <div class="connect">
      <p class="lead">Let Claude, Codex, Cursor or another AI agent work in this editor as you. It saves drafts and never
        publishes – that stays your button.</p>

      <div class="step">
        <span class="num">1</span>
        <div>
          <p class="label">Which agent?</p>
          <Segmented options={CLIENTS} value={client} label="Agent" labels={Object.fromEntries(CLIENTS.map(c => [c, CLIENT_INFO[c].label]))} onchange={pick} />
        </div>
      </div>

      <div class="step">
        <span class="num">2</span>
        <div class="grow">
          {#if fresh}
            <p class="label">Copy this prompt and paste it into {CLIENT_INFO[client].label}</p>
            <div class="prompt-head">
              <button type="button" class="pill primary" onclick={() => copy("prompt", prompt)}>{copied === "prompt" ? "Copied ✓" : "Copy prompt"}</button>
              <span class="small muted">It holds a new token, <b>{fresh.name}</b>, shown only on this page – keep the prompt to yourself.</span>
            </div>
            <pre class="prompt"><code>{prompt}</code></pre>
          {:else if tokens === null || busy}
            <p class="small muted">Preparing your prompt…</p>
          {:else}
            <p class="label">Get your prompt</p>
            <button type="button" class="pill primary" disabled={busy} onclick={makePrompt}
              data-help-name="Create prompt" data-help="Makes a token for this agent on this computer and copies the prompt with it. A token works as you, saves drafts, never publishes, and expires after 182 days unless renewed.">Create token &amp; copy prompt</button>
            <p class="small muted">A token is shown only once, so every agent gets its own.</p>
          {/if}
        </div>
      </div>

      <div class="step">
        <span class="num">3</span>
        <p class="label">The agent sets itself up and asks you to restart it. Done.</p>
      </div>

      <details class="by-hand">
        <summary class="small">Set it up by hand</summary>
        <label class="file">
          <span class="small"><a href={download} download="osct-mcp.mjs">Download osct-mcp.mjs</a> (needs Node 22) – where did you save it?
            A checkout's <code>{SERVER_FILE}</code> works too.</span>
          <input class="field" bind:value={fileInput} onchange={storeFile} onblur={storeFile} placeholder={FILE_PLACEHOLDER} spellcheck="false" autocomplete="off" />
        </label>
        <p class="small muted">{CLIENT_INFO[client].where}:</p>
        <div class="snippet-wrap">
          <pre class="snippet"><code>{snippet}</code></pre>
          <button type="button" class="pill framed corner" onclick={() => copy("snippet", snippet)}>{copied === "snippet" ? "Copied" : "Copy"}</button>
        </div>
        <dl class="rows small">
          {#each values as row (row.key)}
            <dt class="muted">{row.label}</dt><dd><code>{row.value}</code></dd>
          {/each}
        </dl>
        <p class="small muted">Any other MCP client takes these four values. After a deploy of this instance, download the file again.</p>
      </details>
    </div>
  {:else}
    <div class="existing">
      <form class="create" onsubmit={create}>
        <input class="field" bind:value={name} maxlength="80" placeholder={tokenNameFor(client, machine)} aria-label="Name of the connection"
          data-help-name="Name" data-help="Which agent on which machine – it names the agent in the change log of every save it makes." />
        <button type="submit" class="pill framed" disabled={busy}
          data-help-name="Create token" data-help="A personal access token for an AI agent: it works as you, saves drafts and never publishes. It expires after 182 days unless renewed.">Create token</button>
      </form>

      {#if fresh && freshShown}
        <div class="fresh" role="status">
          <p><b>{fresh.name}</b>: copy the token now – it is not shown again. The prompt under <i>Connect an AI agent</i> has it too.</p>
          <div class="secret">
            <code>{fresh.token}</code>
            <button type="button" class="pill framed" onclick={() => copy("fresh", fresh!.token)}>{copied === "fresh" ? "Copied" : "Copy"}</button>
          </div>
        </div>
      {/if}

      {#if tokens === null && !error}
        <p class="small muted">Loading…</p>
      {:else if tokens?.length === 0}
        <p class="small muted">No connection yet.</p>
      {:else if tokens}
        <ul class="list">
          {#each tokens as token (token.id)}
            <li>
              <span class="who">
                <span class="name">{token.name}</span>
                <span class="small muted prefix">{token.prefix}</span>
              </span>
              <span class="small when">
                <span class="muted" title={token.lastUsedAt ?? undefined}>last used {ago(token.lastUsedAt)}</span>
                {#if token.expired}
                  <span class="danger">expired {day(token.expiresAt)}</span>
                {:else}
                  <span class:danger={expiresSoon(token.expiresAt)} class:muted={!expiresSoon(token.expiresAt)}>expires {day(token.expiresAt)}</span>
                {/if}
              </span>
              <span class="actions">
                <button type="button" class="pill framed" disabled={busy} onclick={() => renew(token)}
                  data-help-name="Renew" data-help="Moves the expiry to 182 days from today – the same token keeps working, nothing to change in the agent.">Renew</button>
                <button type="button" class="pill framed" disabled={busy} onclick={() => revoke(token)}
                  data-help-name="Revoke" data-help="The token stops working at once; the change log keeps its name.">Revoke</button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .ai { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--line); max-width: 46rem; }
  p { margin: 0 0 .75rem; line-height: 1.45; }
  code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: var(--text-small); }

  .tabs { display: flex; gap: .125rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .tab { font-weight: 600; }
  .tab.on { background: var(--surface-head); }
  .count { margin-left: .375rem; font-weight: 400; opacity: .6; }

  .lead { max-width: 36rem; }
  .step { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr); gap: .75rem; align-items: start; margin-bottom: 1rem; }
  .num { display: inline-flex; width: 1.5rem; height: 1.5rem; align-items: center; justify-content: center; border-radius: 50%;
    border: 1px solid var(--text); font-size: var(--text-small); font-weight: 600; }
  .label { font-weight: 600; margin: .125rem 0 .5rem; }
  .step > .label { margin-top: .125rem; }
  .prompt-head { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: .5rem; }
  .prompt-head .small { flex: 1 1 14rem; }
  .prompt { margin: 0; padding: .625rem .75rem; max-height: 14rem; overflow: auto; background: var(--surface-head); border: 1px solid var(--line); }
  .prompt code, .snippet code { white-space: pre-wrap; overflow-wrap: anywhere; }

  .by-hand { margin-top: .5rem; padding-top: .75rem; border-top: 1px solid var(--line); }
  .by-hand summary { cursor: pointer; margin-bottom: .5rem; }
  .file { display: grid; gap: .25rem; margin: .5rem 0 .75rem; }
  .snippet-wrap { position: relative; margin-bottom: .75rem; }
  .snippet { margin: 0; padding: .625rem 4.5rem .625rem .75rem; overflow-x: auto; background: var(--surface-head); border: 1px solid var(--line); }
  .corner { position: absolute; top: .375rem; right: .375rem; }
  .rows { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .125rem .75rem; margin: 0 0 .5rem; }
  .rows dt { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: nowrap; }
  .rows dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }

  .create { display: flex; gap: .375rem; margin-bottom: .75rem; }
  .create .field { flex: 1; min-width: 0; }
  .fresh { padding: .75rem; margin-bottom: .75rem; border: 1px solid var(--text); background: var(--surface-head); }
  .secret { display: flex; gap: .375rem; align-items: center; }
  .secret code { flex: 1; min-width: 0; padding: .375rem .5rem; overflow-wrap: anywhere; user-select: all; background: var(--surface); border: 1px solid var(--line); }

  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .25rem .75rem; align-items: center; padding: .5rem 0; border-top: 1px solid var(--line); }
  .list li:last-child { border-bottom: 1px solid var(--line); }
  .who { display: flex; gap: .5rem; align-items: baseline; min-width: 0; }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prefix { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: nowrap; }
  .when { grid-column: 1; display: flex; flex-wrap: wrap; gap: 0 .75rem; }
  .actions { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: .25rem; }

  @media (max-width: 30em) {
    .list li { grid-template-columns: minmax(0, 1fr); }
    .actions { grid-column: 1; grid-row: auto; }
    .rows { grid-template-columns: minmax(0, 1fr); }
  }
</style>
