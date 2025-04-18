# Game Store Configuration

The OSCT Game Store can be configured during initialization using a configuration object. This document explains how to set up and configure the game store for your application.

## Basic Setup

The game store needs to be initialized with chapter data before it can be used. 

### Using a JSON File

```typescript
import { createGameStore } from './store/GameStore';
import config from './game.config.json';

const gameStore = createGameStore();
gameStore.initialize();
```

## Configuration Structure
@deprecated 
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

## Development Tips

- During development, you can use the `mockChapters` from your test files
- Use TypeScript for configuration files to get type checking
- Consider environment-specific configurations
- Monitor the console for initialization messages

### Error Notifications

The game offers a error notification method which opens an `<error-page></error-page>` overlay which displays errors and allows for a custom action to be injected as a callback function.

Example:

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