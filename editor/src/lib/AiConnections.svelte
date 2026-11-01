<script lang="ts">
  import { onMount } from "svelte";
  import { API_URL, createApiToken, errorText, getHealth, listApiTokens, renewApiToken, revokeApiToken, type ApiToken } from "#lib/api.js";
  import Segmented from "#lib/components/Segmented.svelte";
  import {
    ago, apiUrlFor, CLIENT_INFO, CLIENTS, commandLine, day, expiresSoon, FILE_PLACEHOLDER, SERVER_FILE, SERVER_NAME_PLACEHOLDER, serverFileFrom, serverNameFor,
    snippetFor, tokenNameFor, TOKEN_PLACEHOLDER, type McpClient, type McpSetup,
  } from "#lib/mcp-setup.js";
  import { readStored, writeStored } from "#lib/storage.js";

  /**
   * AI connections on the books page (#142, docs/editor.md "AI connections"): the person's personal access tokens for
   * the MCP server – create (a name, then the token shown once with a copy button), the list with last use and expiry,
   * renew (182 days from now) and revoke – and beside them the guide to connect an AI agent: what the server does, what
   * any MCP client needs (the server's name after this instance's environment, `node <file>`, `OSCT_API_URL`,
   * `OSCT_EDITOR_TOKEN`) and the same as each client's snippet. A token just made is filled in; the server file is the
   * path the person types once (kept in this browser). Every call here is the person's own sign-in; the API refuses
   * them to a token.
   */
  let tokens = $state<ApiToken[] | null>(null);
  let name = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  /** The token just made – shown until the person closes it; never stored */
  let fresh = $state<{ name: string; token: string } | null>(null);
  let client = $state<McpClient>("claude-code");
  /** Which copy button just copied (its label says so for a moment) */
  let copied = $state<string | null>(null);
  /** This instance's environment from GET /health (null until known) */
  let env = $state<string | null>(null);

  const FILE_KEY = "osct-editor-mcp-file";
  /** What the person typed for the server file – the checkout's `mcp/bin/osct-mcp.mjs` or the checkout itself */
  let fileInput = $state(readStored(FILE_KEY) ?? "");
  const storeFile = () => writeStored(FILE_KEY, fileInput.trim() || null);

  const apiUrl = typeof location === "undefined" ? API_URL : apiUrlFor(API_URL, location.origin);
  const setup = $derived<McpSetup>({ name: env ? serverNameFor(env) : SERVER_NAME_PLACEHOLDER, api: apiUrl, token: fresh?.token ?? null, file: serverFileFrom(fileInput) });
  const snippet = $derived(snippetFor(client, setup));
  const generic = $derived([
    { key: "name", label: "name", value: setup.name, help: "The name the client lists the server under – one per instance, so several sit side by side." },
    { key: "command", label: "command", value: commandLine(setup), help: "What the client starts: Node 22 with the MCP server of your checkout." },
    { key: "api", label: "OSCT_API_URL", value: setup.api, help: "This instance's API – the server talks to it as you." },
    { key: "token", label: "OSCT_EDITOR_TOKEN", value: setup.token ?? TOKEN_PLACEHOLDER, help: "A token from the list on the left – filled in right after you create one, never stored." },
  ]);


  const load = async () => {
    try {
      tokens = (await listApiTokens()).tokens;
    } catch (e) {
      error = errorText(e);
    }
  };
  onMount(() => {
    void load();
    getHealth().then(h => (env = h.env), () => (env = null));
  });

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

  const create = (event: SubmitEvent) => {
    event.preventDefault();
    return run(async () => {
      const made = await createApiToken(name.trim());
      fresh = { name: made.apiToken.name, token: made.token };
      name = "";
      await load();
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
    });
  };

  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      copied = key;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = null), 1600);
    } catch {
      error = "The browser did not allow copying – select the text and copy it by hand.";
    }
  };
</script>

<section class="ai" aria-label="AI connections">
  <div class="tokens">
    <h2>AI connections</h2>
    <form class="create" onsubmit={create}>
      <input class="field" bind:value={name} maxlength="80" required placeholder={tokenNameFor(client)} aria-label="Name of the connection"
        data-help-name="Name" data-help="Which agent on which machine (e.g. Codex on my laptop) – it names the agent in the change log of every save it makes." />
      <button type="submit" class="pill primary" disabled={busy || !name.trim()}
        data-help-name="Create token" data-help="Makes a personal access token for an AI agent's MCP client: it works as you, saves drafts and never publishes. It expires after 182 days unless renewed.">Create token</button>
    </form>

    {#if fresh}
      <div class="fresh" role="status">
        <p><b>{fresh.name}</b>: copy the token now – it is not shown again.</p>
        <div class="secret">
          <code>{fresh.token}</code>
          <button type="button" class="pill framed" onclick={() => copy("fresh", fresh!.token)}>{copied === "fresh" ? "Copied" : "Copy"}</button>
        </div>
        <p class="small muted">The setup under <i>Connect an AI agent</i> has it filled in.
          <button type="button" class="text-link" onclick={() => (fresh = null)}>Done</button></p>
      </div>
    {/if}

    {#if error}<p class="danger small">{error}</p>{/if}

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

  <div class="guide">
    <h2>Connect an AI agent</h2>
    <p>The OSCT <b>MCP server</b> lets an AI agent – Claude, Codex, OpenCode, Cursor or any other MCP client – work in this
      editor as you: it reads the books, saves drafts – the stage shows them at once, every answer links there – and never
      publishes. Readers are reached only by your Publish button.</p>

    <h3>Any MCP client (stdio)</h3>
    <label class="file">
      <span class="small">The path to <code>{SERVER_FILE}</code> in your osct checkout</span>
      <input class="field" bind:value={fileInput} onchange={storeFile} onblur={storeFile} placeholder={FILE_PLACEHOLDER} spellcheck="false" autocomplete="off"
        data-help-name="Server file" data-help="Where the MCP server lies on your computer – typed once, this browser remembers it and fills it into every snippet. The checkout's folder works too." />
    </label>
    <dl class="rows">
      {#each generic as row (row.key)}
        <dt class="small muted">{row.label}</dt>
        <dd><code>{row.value}</code></dd>
        <dd class="copy"><button type="button" class="pill framed" onclick={() => copy(row.key, row.value)} data-help-name={row.label} data-help={row.help}>{copied === row.key ? "Copied" : "Copy"}</button></dd>
      {/each}
    </dl>

    <div class="setup">
      <Segmented options={CLIENTS} value={client} labels={Object.fromEntries(CLIENTS.map(c => [c, CLIENT_INFO[c].label]))}
        titles={Object.fromEntries(CLIENTS.map(c => [c, CLIENT_INFO[c].where]))} onchange={v => (client = v)} />
      <button type="button" class="pill framed" onclick={() => copy("snippet", snippet)}>{copied === "snippet" ? "Copied" : "Copy"}</button>
    </div>
    <pre class="snippet"><code>{snippet}</code></pre>
    <ol class="steps">
      <li>Once: a checkout of the OSCT repository and <code>npm ci</code> in its <code>mcp/</code> folder (Node 22); type the
        path above.</li>
      <li>Create a token named after the agent and the machine, then
        {#if client === "claude-code"}
          run the command in a terminal.
        {:else if client === "claude-desktop"}
          add the entry to <code>claude_desktop_config.json</code> (Settings → Developer → Edit Config) and restart Claude Desktop.
        {:else if client === "codex"}
          add the table to <code>~/.codex/config.toml</code>.
        {:else if client === "opencode"}
          add the entry to <code>~/.config/opencode/opencode.json</code> (every project) or a project's <code>opencode.json</code>.
        {:else}
          add the entry to <code>~/.cursor/mcp.json</code> (every project) or a project's <code>.cursor/mcp.json</code>.
        {/if}
        Any other client: the four values above.</li>
      <li>Ask the agent <code>whoami</code> – it names you and the token – then <code>describe_content_model</code> before the
        first change.</li>
    </ol>
  </div>
</section>

<style>
  .ai { display: grid; gap: 1.5rem 2.5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); align-items: start;
    margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--line); }
  h2 { font-size: .875rem; font-weight: 600; margin: 0 0 .75rem; }
  h3 { font-size: var(--text-small); font-weight: 600; margin: 1rem 0 .5rem; }
  p { margin: 0 0 .75rem; line-height: 1.45; }
  code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: var(--text-small); }

  .create { display: flex; gap: .375rem; margin-bottom: .75rem; }
  .create .field { flex: 1; min-width: 0; }

  .fresh { padding: .75rem; margin-bottom: .75rem; border: 1px solid var(--text); background: var(--surface-head); }
  .fresh p:last-child { margin: .5rem 0 0; }
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

  .file { display: grid; gap: .25rem; margin-bottom: .5rem; }
  .rows { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .25rem .75rem; align-items: center; margin: 0 0 1rem; }
  .rows dt { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: nowrap; }
  .rows dd { margin: 0; min-width: 0; }
  .rows dd code { overflow-wrap: anywhere; }
  .setup { display: flex; gap: .5rem; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: .375rem; }
  .snippet { margin: 0 0 .75rem; padding: .625rem .75rem; overflow-x: auto; background: var(--surface-head); border: 1px solid var(--line); }
  .snippet code { white-space: pre-wrap; overflow-wrap: anywhere; }
  .steps { margin: 0; padding-left: 1.25rem; display: grid; gap: .375rem; line-height: 1.45; }

  @media (max-width: 30em) {
    .list li { grid-template-columns: minmax(0, 1fr); }
    .actions { grid-column: 1; grid-row: auto; }
    .rows { grid-template-columns: minmax(0, 1fr) auto; row-gap: 0; }
    .rows dt { grid-column: 1 / -1; margin-top: .5rem; }
  }
</style>
