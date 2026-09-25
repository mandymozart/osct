# Components

Vanilla custom elements with shadow DOM in `client/src/components/`. They get the store from
`GameStoreService.getInstance()`, subscribe in `connectedCallback` and unsubscribe in
`disconnectedCallback` (see [Game store](/docs/store/game-store)).

| Folder | Elements |
|---|---|
| `header/` | `<game-header>` with `<mark-the-page>` (Mark, the app's main button) and `<entries-counter>` |
| `scan/` | `<spread-menu>` (looped spread menu at the bottom), `<found-indicator>` (found target without AR content) |
| `aframe-bridges/` | `<ar-bridge>` – the A-Frame / MindAR scene; entities, chroma key, AR scene strategies |
| `consultation/` | helpers of the entries list and entry view (labels, grouping, link embeds, icons) |
| `tutorial/` | `<tutorial-content>`, `<tutorial-navigation>` |
| `camera-permission/` | `<camera-permission>` – shown when the camera is denied |
| `common/` | `<close-button>`, `<gold-illustration>` (SVG in the gold gradient), `text-button` |
| `pages-router/` | `<pages-router>` – shows the page of the current route |
| `icons/` | small SVG icons (`<cross-icon>`, `<index-icon>`, …) |
| `dev-tools/` | `<debug-overlay>` (with `VITE_DEBUG=true`) and `<qr-generator>` |
| `index/`, `navigation/`, `buttons/` | views of the former design: dev index, hidden navigation bar |

## Design styles

Colors, the gold gradient, glass and shadows are CSS tokens in `client/src/main.css`. Shared
primitives (`.button`, `.pill`, `.primary`, `.gold`, `.muted`, …) are one constructable stylesheet:

```typescript
import { adoptDesignStyles } from "@/styles/design-styles";

adoptDesignStyles(this.shadowRoot!);
```

Values come from the measured design spec, `agents/DESIGN.md`.
