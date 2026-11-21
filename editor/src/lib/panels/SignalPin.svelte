<script lang="ts">
  import { SIGNAL_STYLES, signalToken, type DeckSignal } from "#lib/logic/signals.js";

  /**
   * A signal's pin as the Logic legend draws it (#334): its shape and its `--signal-*` colour (`logic/signals.ts`). The
   * legend under the Logic bar and the add menu's type column both use it, so the two stay one.
   */
  let { signal }: { signal: DeckSignal } = $props();
</script>

<span class="pin {SIGNAL_STYLES[signal].shape}" style:--pin="var({signalToken(signal)})" aria-hidden="true"></span>

<style>
  .pin { display: inline-block; flex: none; width: .5625rem; height: .5625rem; background: var(--pin); border-radius: 50%; }
  .pin.square { border-radius: .125rem; }
  .pin.diamond { width: .4375rem; height: .4375rem; border-radius: .0625rem; transform: rotate(45deg); }
  .pin.triangle { border-radius: 0; width: .5rem; height: .625rem; clip-path: polygon(0 0, 100% 50%, 0 100%); }
  .pin.ring { background: none; border: 2px solid var(--pin); box-sizing: border-box; }
</style>
