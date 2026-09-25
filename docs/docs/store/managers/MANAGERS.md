# Managers

Each manager owns one part of the game state and is reached through the store
(`game.spreads`, `game.targets`, …). Managers are created by `GameStore` and get the store
injected in the constructor. Interfaces: `client/src/types/`.

| Manager | Store | State / responsibility |
|---|---|---|
| `SpreadManager` | `game.spreads` | `currentSpread` – switching the active spread (the MindAR target group of two pages) |
| `TargetManager` | `game.targets` | `trackedTargets` – targets found / lost by the AR scene; unlocks via the history |
| `HistoryManager` | `game.history` | `progress` – unlocked targets, consulted entries, bookmarks, notes, last spread / category, onboarding, resume offer |
| `RouterManager` | `game.router` | `currentRoute`, `mode` – navigation, see [Pages](/docs/pages/) |
| `CameraManager` | `game.camera` | `cameraPermission` – asking for and tracking camera access |

## Progress storage

`HistoryManager` keeps one progress record per book on the device (`services/ProgressStorage.ts`,
localStorage). Records are read through `utils/progress-record.ts`: the storage format is the app's
MAJOR version, with one reader per format. Unknown, newer or corrupt records are reset and the
reader is told.

## Services used by managers

- `GameStoreService` – the store singleton
- `PreloaderService` – warms the browser cache with the neighbouring spreads' `.mind` files and content
- `ProgressStorage` – reads and writes the progress record
