<script lang="ts">
  import { onMount } from "svelte";
  import { downloadUsersCsv, errorText, grantRole, inviteEditor, listRoles, listUsers, revokeRole, type AdminUser, type Role } from "#lib/api.js";
  import { session } from "#lib/session.svelte.js";
  import { csvDownload, type UserFilter } from "#lib/users-csv.js";
  import Segmented from "#lib/components/Segmented.svelte";
  import Toggle from "#lib/components/Toggle.svelte";

  /**
   * The admin page (docs/admin.md): the instance's users found by e-mail, each one's roles as toggles (granted when and
   * by whom on hover), their language and the update options they opted into (plain text, read-only); the editors as
   * a shortcut; the newsletter list (the users with an update option on) as a CSV download; an editor invited by
   * e-mail. Only admins get here (+layout.svelte); the API is docs/server.md "Admin API".
   */
  type Filter = UserFilter;
  const FILTERS: readonly Filter[] = ["all", "editor", "admin", "newsletter"];
  const FILTER_LABELS: Record<Filter, string> = { all: "All", editor: "Editors", admin: "Admins", newsletter: "Newsletter" };
  /** The option keys of the account (Auth::OPTIONS) with a short label each */
  const OPTIONS: { key: string; label: string }[] = [
    { key: "bookUpdates", label: "book" },
    { key: "artistUpdates", label: "artist" },
    { key: "publisherUpdates", label: "publisher" },
  ];

  let roles = $state<Role[]>([]);
  let users = $state<AdminUser[] | null>(null);
  let total = $state(0);
  let q = $state("");
  let filter = $state<Filter>("all");
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  /** The user whose role is being changed (its toggles wait) */
  let working = $state<string | null>(null);
  let invite = $state("");
  let inviting = $state(false);

  const fail = (e: unknown) => (error = errorText(e));

  const load = async () => {
    error = null;
    try {
      const result = await listUsers({ q: q.trim() || undefined, role: filter === "editor" || filter === "admin" ? filter : undefined, newsletter: filter === "newsletter" });
      users = result.users;
      total = result.total;
    } catch (e) {
      fail(e);
    }
  };

  onMount(async () => {
    try {
      roles = (await listRoles()).roles;
    } catch (e) {
      fail(e);
    }
    await load();
  });

  const search = (event: SubmitEvent) => {
    event.preventDefault();
    void load();
  };

  const setFilter = (next: Filter) => {
    filter = next;
    void load();
  };

  /** The roles an admin may toggle – reader belongs to every account */
  const toggleable = $derived(roles.filter(role => role.name !== "reader"));

  const toggle = async (user: AdminUser, role: string) => {
    const on = !user.roles.includes(role);
    const self = user.email === session.user?.email;
    if (!on && role === "admin" && self && !confirm("Give up your own admin role? You will not get back to this page without another admin.")) return;
    working = user.id;
    error = null;
    try {
      const result = on ? await grantRole(user.id, role) : await revokeRole(user.id, role);
      users = users?.map(u => (u.id === user.id ? result.user : u)) ?? null;
      if (self) await session.restore(true);
      // Only a real change is reported – the row shows the roles the API answered with (#99)
      notice = result.changed
        ? `${on ? "Granted" : "Revoked"} ${role} ${on ? "to" : "from"} ${user.email}.`
        : `${user.email} ${on ? "had" : "did not have"} ${role} already.`;
    } catch (e) {
      fail(e);
    } finally {
      working = null;
    }
  };

  const grantOf = (user: AdminUser, role: string) => user.grants.find(g => g.role === role);
  const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "–");
  const by = (grant: { grantedBy: string | null; grantedByEmail: string | null }) => grant.grantedByEmail ?? grant.grantedBy ?? "–";
  const grantTitle = (user: AdminUser, role: string) => {
    const grant = grantOf(user, role);
    return grant ? `${role}: granted ${when(grant.grantedAt)} by ${by(grant)}` : `${role}: not granted`;
  };

  const submitInvite = async (event: SubmitEvent) => {
    event.preventDefault();
    const email = invite.trim();
    if (!email) return;
    inviting = true;
    error = null;
    try {
      const result = await inviteEditor(email);
      notice = result.created ? `${result.user.email} created as an editor.` : result.changed ? `${result.user.email} is an editor now.` : `${result.user.email} was an editor already.`;
      invite = "";
      await load();
    } catch (e) {
      fail(e);
    } finally {
      inviting = false;
    }
  };

  let downloading = $state(false);
  /** The CSV this filter offers – none under Editors or Admins */
  const csv = $derived(csvDownload(filter));
  const download = async () => {
    if (!csv) return;
    downloading = true;
    error = null;
    try {
      await downloadUsersCsv(csv.newsletter);
    } catch (e) {
      fail(e);
    } finally {
      downloading = false;
    }
  };
</script>

<main>
  <h1>Users</h1>
  <div class="toolbar">
    <form class="search" onsubmit={search}>
      <input class="field" type="search" bind:value={q} placeholder="Search by e-mail" aria-label="Search by e-mail" />
      <button type="submit" class="pill framed">Search</button>
    </form>
    <Segmented options={FILTERS} value={filter} labels={FILTER_LABELS} label="Filter" onchange={setFilter} />
    <span class="grow"></span>
    {#if csv}
      <button type="button" class="pill framed" onclick={download} disabled={downloading} title={csv.title}>{csv.label}</button>
    {/if}
  </div>

  {#if error}<p class="danger">{error}</p>{/if}
  {#if notice}<p class="muted small">{notice}</p>{/if}

  {#if users === null}
    <p class="muted">Loading…</p>
  {:else if users.length === 0}
    <p class="muted">No user matches.</p>
  {:else}
    <p class="muted small">{total === users.length ? `${total} user${total === 1 ? "" : "s"}` : `${users.length} of ${total} users – narrow the search`}</p>
    <table class="users">
      <thead>
        <tr>
          <th>e-mail</th>
          <th>roles</th>
          <th>language</th>
          <th title="Update options the user opted into: news about the book, the artist, the publisher">options</th>
          <th>signed up</th>
          <th>last seen</th>
        </tr>
      </thead>
      <tbody>
        {#each users as user (user.id)}
          <tr>
            <td class="email">{user.email}{#if user.hasPassword}<span class="muted small" title="Has a password"> ·&nbsp;pw</span>{/if}</td>
            <td data-label="roles">
              <span class="controls">
                <span class="pill fixed muted" title={grantTitle(user, "reader")}>reader</span>
                {#each toggleable as role (role.id)}
                  <!-- A role is on or off for the user: its name and a switch (#241) -->
                  <span class="role" title={grantTitle(user, role.name)}>{role.name}
                    <Toggle on={user.roles.includes(role.name)} label="{role.name} role of {user.email}" title={grantTitle(user, role.name)}
                      disabled={working === user.id} onchange={() => toggle(user, role.name)} /></span>
                {/each}
              </span>
            </td>
            <td data-label="language">{user.language}</td>
            <td class="options" data-label="options">
              <!-- Plain text, not controls: the options the user opted into, read-only (#99) -->
              <span>{#each OPTIONS.filter(option => user.options[option.key]) as option, i (option.key)}{i ? ", " : ""}<span title={`${option.label} updates: yes`}>{option.label}</span>{:else}<span class="muted" title="No update options">–</span>{/each}</span>
            </td>
            <td class="muted" data-label="signed up" title={when(user.createdAt)}>{new Date(user.createdAt).toLocaleDateString()}</td>
            <td class="muted" data-label="last seen" title={when(user.lastSeenAt)}>{user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleDateString() : "–"}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <form class="invite" onsubmit={submitInvite}>
    <h2>Invite an editor</h2>
    <p class="muted small">The address gets the role editor at once – a new address becomes an account that signs in with a code by e-mail, like every reader.</p>
    <div class="search">
      <input class="field" type="email" bind:value={invite} placeholder="name@example.com" autocomplete="off" required />
      <button type="submit" class="pill primary" disabled={inviting}>Make editor</button>
    </div>
  </form>
</main>

<style>
  main { max-width: 64rem; margin: 0 auto; padding: 1rem; }
  h1, h2 { font-size: 1rem; font-weight: 600; margin: 0 0 .5rem; }
  h2 { font-size: var(--text-size); margin-top: 1.5rem; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .5rem; }
  .search { display: flex; gap: .25rem; }
  .search .field { width: 16rem; max-width: 100%; }
  .users { width: 100%; border-collapse: collapse; margin: .25rem 0 0; }
  .users th { text-align: left; font-weight: normal; color: var(--muted); font-size: var(--text-small); letter-spacing: .08em; text-transform: uppercase; padding: .25rem .5rem .25rem 0; border-bottom: 1px solid var(--line); }
  .users td { padding: .25rem .5rem .25rem 0; border-bottom: 1px solid var(--line); vertical-align: middle; white-space: nowrap; }
  .users .email { font-weight: 500; }
  .pill.fixed { cursor: default; padding: 0 .375rem; }
  .role { display: inline-flex; align-items: center; gap: .25rem; margin-left: .25rem; }
  @media (hover: hover) {
    .pill.fixed:hover { background: none; }
  }
  .invite .search { margin-top: .25rem; }
  @media (max-width: 40rem) {
    .users thead { display: none; }
    .users tr { display: grid; grid-template-columns: 1fr; padding: .375rem 0; border-bottom: 1px solid var(--line); }
    .users td { border: none; padding: .125rem 0; white-space: normal; }
    .users td[data-label] { display: grid; grid-template-columns: 4.75rem minmax(0, 1fr); gap: .375rem; align-items: center; }
    .users td[data-label]::before { content: attr(data-label); color: var(--muted); }
  }
</style>
