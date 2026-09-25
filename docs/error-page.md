# Error page

`<error-page>` is an overlay for errors and notices (e.g. "resume your previous session"). Open it
through the store, not directly:

```typescript
game.notifyError({
  code: ErrorCode.SPREAD_LOAD_FAILED,      // optional – see client/src/types/errors.ts
  msg: "The spread could not be loaded.",
  type: "warning",                         // "critical" | "warning" | "info"
  action: { text: "Retry", callback: () => game.spreads.switchSpread(spreadId) },  // optional
});
```

With an action the page shows it as the primary button and "Dismiss" as the secondary one.
`game.onError(listener)` lets components react to errors as well.
