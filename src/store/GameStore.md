# Game Store Configuration

The OSCT Game Store can be configured during initialization using a configuration object. This document explains how to set up and configure the game store for your application.

## Basic Setup

The game store needs to be initialized with chapter data before it can be used. 

### Using a JSON File

```typescript
import { createGameStore } from './store/GameStore';
import config from './game.config.json';

const gameStore = createGameStore();
gameStore.initialize({version: '1.0.0', chaptersData: []});
```

### Using an API

```typescript
import { createGameStore } from './store/GameStore';

async function initializeGame() {
  const gameStore = createGameStore();
  const config = await fetch('/api/config').then(r => r.json());
  
  gameStore.initialize(config);
}
```

### Using HTML Configuration

```html
<script type="application/json" id="game-config">
{
    version: "1.0.0",
    chapters: []
}
</script>

<script>
import { createGameStore } from './store/GameStore';

const gameStore = createGameStore();
const config = JSON.parse(document.getElementById('game-config').textContent);
gameStore.initialize(config);
</script>
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

## Development Tips

- During development, you can use the `mockChapters` from your test files
- Use TypeScript for configuration files to get type checking
- Consider environment-specific configurations
- Monitor the console for initialization messages

## Testing

When testing components that use the game store, initialize it with mock data:

```typescript
import { createGameStore } from './store/GameStore';
import { mockChapters } from './mocks/mockChapters';

describe('GameComponent', () => {
  let gameStore;

  beforeEach(() => {
    gameStore = createGameStore();
    gameStore.initialize({
      chapters: mockChapters
    });
  });

  // ... tests
});
```