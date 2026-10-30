# Error page

`<error-page>` is an overlay for errors and notices (e.g. "your saved progress was converted"). Open it
through the store, not directly:

```typescript
game.notifyError({
  code: ErrorCode.NETWORK_ERROR,           // one of ErrorCode (engine/src/types/errors.ts, re-exported by @/types)
  msg: t("startup:contentNotLoaded"),      // the reader's text, from i18n
  type: "warning",                         // "critical" | "warning" | "info"
  action: { text: "Retry", callback: () => location.reload() },  // optional
});
```

Every error carries an `ErrorCode` (RULES #16) – a new kind of error adds its code there; the text comes from the
reader's i18n, never from the code. Today's codes: `not-supported`, `game-configuration-invalid` and `network-error`
(the content at startup – the critical screen in `main.ts`), `progress-converted` and `progress-reset` (stored progress
at startup, `HistoryManager.reportLoadStatus`, an info notice), and the AR scene's `ar-load-failed`, `ar-start-failed`,
`camera-not-responding` and `ar-failed`, which never reach this page: `<ar-bridge>` turns them into the camera
overlay ([Tracking](tracking.md) "What the app gives the engine").

With an action the page shows it as the primary button and "Dismiss" as the secondary one. "Dismiss"
(`router.dismissError()`) returns to the view under the notice.
`game.onError(listener)` lets components react to errors as well.
