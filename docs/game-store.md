# Game Store

The game store (`client/src/store/GameStore.ts`) extends the [BaseStore](base-store.md)
with the app state and one manager per concern. Components get the single instance from
`GameStoreService`.

```typescript
import { GameStoreService } from "@/services";

const game = GameStoreService.getInstance();
game.router.navigate("/entries", { key: "category", value: "video" });
game.state.mode; // "idle" | "scan" | "consultation"
```

In the browser console the instance is available as `window.BOOKGAME` (for debugging).

## Structure

```
GameStore (extends BaseStore<GameState>)
├── state
├── spreads    SpreadManager    active spread (its targets are tracked), switching
├── targets    TargetManager    found / lost targets of the active spread
├── history    HistoryManager   reading progress per book: unlocked, consulted,
│                               last spread / category, onboarding; stored on the device
├── router     RouterManager    pages, routes and the game mode (idle / scan / consultation)
├── camera     CameraManager    camera permission
├── startLoading() / finishLoading()
├── setArStatus()               reported by <ar-bridge>
└── notifyError() / onError()   error and notice overlay – see Error page
```

What each manager owns: [Managers](managers.md).

## Game configuration

The store does not load `game.config.json` itself: content (book, spreads, targets, entries)
is read through `client/src/utils/game-config.ts` (`getBook()`, `getSpreads()`,
`getTargets(spreadId)`, `getEntries()`, `getEntry(id)`, …), the only module that imports the file.
Its shape is defined in `shared/types/game-config.ts` – see [Content build](content.md#content-build).

## In a component

Subscribe to the properties you render, keep the unsubscribe function and call it when the element leaves the
DOM (RULES #6):

```typescript
private unsubscribe: (() => void) | null = null;

connectedCallback() {
  this.unsubscribe = this.game.subscribeToProperty("mode", mode => this.render(mode));
  this.render(this.game.state.mode);
}

disconnectedCallback() {
  this.unsubscribe?.();
  this.unsubscribe = null;
}
```

`game.subscribe(listener)` reports every state change (the listener gets the changed properties); it returns an
unsubscribe function the same way. Errors and notices go through `game.notifyError()` and open the
[Error page](error-page.md).
