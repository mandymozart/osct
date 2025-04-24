# Game Store Configuration

The OSCT Game Store extends the BaseStore system to provide specialized state management for AR experiences. This document explains how to set up and use the game store with your application.

## Architecture

The Game Store is built on top of the BaseStore, which provides:

- Immutable state updates with Immer
- Global and property-level subscriptions
- Fine-grained reactivity ideal for Web Components

### Game Store Structure

```
GameStore (extends BaseStore<GameState>)
├── state               // Immutable state tree
├── Managers            // Specialized domain controllers
│   ├── ChapterManager  // Handles chapter loading/state
│   ├── RouterManager   // Manages UI navigation 
│   ├── CameraManager   // Camera permissions and access
│   ├── QRManager       // QR code scanning
│   ├── AssetManager    // Asset loading and tracking
│   └── EntityManager   // 3D entity management
└── Services            // Utility functions and services
```

## Basic Setup

```typescript
import { createGameStore } from './store/GameStore';
import config from './game.config.json';

const gameStore = createGameStore();
gameStore.initialize();
```

## Configuration Structure

The game configuration object follows this structure:

```typescript
interface GameConfiguration {
  version: string,
  chapters: Array<{
    id: string;
    order: number;
    title: string;
    imageTargetSrc: string;
    targets: Array<{
      mindarTargetIndex: number;
      bookId: string;
      title: string;
      description: string;
      entity: {
        assets: Array<{
          src: string;
          type?: string;
        }>;
      };
    }>;
  }>;
}
```

TODO: tutorial configuration is missing

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
  code: ErrorCode.CAMERA_PERMISSION_DENIED,
  msg: "Camera access was denied. Please enable camera permissions to use AR features.",
  action: {
    text: "Open Settings", 
    callback: () => {
      console.log("[Camera Manager] Showing settings instructions");
      this.game.router.close();
    }
  }
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