<script lang="ts">
  import { session } from "#lib/session.svelte.js";

  /** Sign in as the instance user: a code by email (the reader's way), or the password of an account that set one */
  let email = $state("");
  let code = $state("");
  let password = $state("");
  let withPassword = $state(false);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (session.pending) return void session.confirmCode(code);
    if (withPassword) return void session.signInPassword(email.trim(), password);
    void session.sendCode(email.trim());
  };
</script>

<form onsubmit={submit} class="sign-in">
  <h1>OSCT Editor</h1>
  <p class="muted">Sign in with your account of this instance. Editors and admins only.</p>
  {#if session.notice}<p class="small" role="status">{session.notice}</p>{/if}
  {#if session.pending}
    <label class="row"><span class="label">code</span>
      <input class="field" bind:value={code} inputmode="numeric" autocomplete="one-time-code" placeholder="6 digits from the email" required /></label>
    <p class="small muted">Sent to {session.pending.email}. <button type="button" class="text-link" onclick={() => (session.pending = null)}>Other address</button></p>
  {:else}
    <label class="row"><span class="label">email</span>
      <input class="field" type="email" bind:value={email} autocomplete="email" required /></label>
    {#if withPassword}
      <label class="row"><span class="label">password</span>
        <input class="field" type="password" bind:value={password} autocomplete="current-password" required /></label>
    {/if}
    <p class="small muted">
      {#if withPassword}
        <button type="button" class="text-link" onclick={() => (withPassword = false)}>Send me a code instead</button>
      {:else}
        <button type="button" class="text-link" onclick={() => (withPassword = true)}>I have a password</button>
      {/if}
    </p>
  {/if}
  {#if session.error}<p class="danger small">{session.error}</p>{/if}
  <p><button type="submit" class="pill primary" disabled={session.busy}>
    {session.pending ? "Sign in" : withPassword ? "Sign in" : "Send the code"}
  </button></p>
</form>

<style>
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 .25rem; }
  .sign-in .row { margin: .25rem 0; }
  .field { width: 100%; }
</style>
