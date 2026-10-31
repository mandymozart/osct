# BaseStore

`client/src/store/BaseStore.ts` – the reader's small observable store: immutable updates with Immer, listeners for the
whole state and per top-level property. The one store built on it is the [game store](game-store.md) (`GameStore
extends BaseStore<GameState>`); components and managers reach it through `GameStoreService.getInstance()`.

## Updating

```typescript
game.update(draft => {
  draft.mode = "scan";            // an Immer draft: write as if it were mutable
});

game.set({ mode: "scan" });       // the shortcut: shallow-merges a partial state
```

`update` runs the recipe through Immer's `produce`, so `state` is never changed in place: a change makes a new
object.

## Listening

```typescript
const off = game.subscribe(state => { /* any change */ });
const offMode = game.subscribeToProperty("mode", (mode, previous) => { /* this property changed */ });
off();
offMode();
```

Both return their unsubscribe (`unsubscribe` / `unsubscribeFromProperty` do the same by callback). A component
subscribes in `connectedCallback` and unsubscribes in `disconnectedCallback` – `header/entries-counter.ts`:

```typescript
connectedCallback() {
  this.unsubscribe = this.game.subscribeToProperty("progress", () => this.render());
  this.render();
}

disconnectedCallback() {
  this.unsubscribe?.();
  this.unsubscribe = null;
}
```

## What counts as a change

After an update the store compares every **top-level** property with its value before: an object or array by its JSON
(a new reference with the same content does not notify), anything else by identity. Each changed property notifies its
property listeners with the new and the previous value, then – if anything changed – the whole-state listeners run
once. A value that cannot be turned into JSON (circular) is compared by reference, with a console warning. A nested
change notifies the listeners of the top-level property that holds it.
