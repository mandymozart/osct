# Game Store

The game store (`client/src/store/GameStore.ts`) extends the [BaseStore](/docs/store/base-store)
with the app state and one manager per concern. Components get the single instance from
`GameStoreService`.

```typescript
import { GameStoreService } from "@/services/GameStoreService";

const game = GameStoreService.getInstance();
game.router.navigate("/entries", { key: "category", value: "video" });
game.state.mode; // "idle" | "scan" | "consultation"
```

In the browser console the instance is available as `window.BOOKGAME` (for debugging).

## Structure

```
GameStore (extends BaseStore<GameState>)
├── state
├── spreads    SpreadManager    active spread (= MindAR target group), switching
├── targets    TargetManager    found / lost targets of the active spread
├── history    HistoryManager   reading progress per book: unlocked, consulted, bookmarks, notes,
│                               last spread / category, onboarding; stored on the device
├── router     RouterManager    pages, routes and the game mode (idle / scan / consultation)
├── camera     CameraManager    camera permission
├── startLoading() / finishLoading() / setLoadingState()
├── setArStatus()               reported by <ar-bridge>
└── notifyError() / onError()   error and notice overlay
```

See [Managers](/docs/store/managers/).

## Game configuration

The store does not load `game.config.json` itself: content (book, spreads, targets, entries,
tutorial) is read through `client/src/utils/game-config.ts` (`getBook()`, `getSpreads()`,
`getTargets(spreadId)`, `getEntries()`, `getEntry(id)`, …), the only module that imports the file.
Its shape is defined in `shared/types/game-config.ts` – see [Content build](/docs/content/configuration).

## Component Integration

### Using Property Subscriptions (Recommended)

Subscribe to specific property changes for efficient updates:

```typescript
// In your component
constructor() {
  super();
  this.game = GameStoreService.getInstance();
  this.handleModeChange = this.handleModeChange.bind(this);
}

connectedCallback() {
  // Subscribe to only the 'mode' property changes
  this.unsubscribe = this.game.subscribeToProperty('mode', this.handleModeChange);
  
  // Check initial state
  this.handleModeChange(this.game.state.mode);
}

disconnectedCallback() {
  // Clean up subscription
  if (this.unsubscribe) {
    this.unsubscribe();
    this.unsubscribe = null;
  }
}

handleModeChange(mode, prevMode) {
  if (prevMode !== undefined && mode === prevMode) {
    return;
  }
  
  // Handle mode changes...
}
```

### Using Global State Subscriptions

Subscribe to all state changes when needed:

```typescript
// Subscribe to any state change
this.unsubscribe = this.game.subscribe(state => {
  if ('mode' in state) {
    this.handleModeChange(state.mode);
  }
});
```

## Error Handling

The game provides a centralized error handling system that opens an `<error-page></error-page>` overlay which displays errors and allows for a custom action to be injected as a callback function:

```typescript
this.game.notifyError({
  msg: 'You have a previous session in spread "The Castle Gates".',
  type: "info",
  action: { text: "Resume", callback: () => this.game.spreads.switchSpread(spreadId) },
});
```

Components can subscribe to error events:

```typescript
this.errorUnsubscribe = this.game.onError(error => {
  // Handle error
});
```

## Development Tips

- Use property-level subscriptions for better performance
- Clean up subscriptions in `disconnectedCallback` to prevent memory leaks
- Compare previous and current values to avoid redundant UI updates
- Use early returns to handle initial state or no-change scenarios