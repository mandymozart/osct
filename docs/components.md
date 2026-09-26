# Components

Vanilla custom elements with shadow DOM in `client/src/components/`. They get the store from
`GameStoreService.getInstance()`, subscribe in `connectedCallback` and unsubscribe in
`disconnectedCallback` (see [Game store](game-store.md)).

| Folder | Elements |
|---|---|
| `header/` | `<game-header>` with `<mark-the-page>` (Mark, the app's main button) and `<entries-counter>` |
| `scan/` | `<spread-menu>` (looped spread menu at the bottom), `<found-indicator>` (found target without AR content) |
| `aframe-bridges/` | `<ar-bridge>` – the A-Frame / MindAR scene (`ArScene`: one scene, spreads swapped in place); entities, video filters |
| `consultation/` | `<entries-filter>` (category dropdown), `<entries-list>`, `<entry-detail>` (meta table + content per category); helpers in `entries-model.ts` |
| `tutorial/` | `<tutorial-content>`, `<tutorial-navigation>` |
| `common/` | `<gold-illustration>` (SVG in the gold gradient) |
| `settings/` | Info page settings, one component per section: `<settings-tutorial>`, `<settings-history>` (reset book), `<settings-language>` |
| `buttons/` | `goldButton()` – markup of the design buttons (button / pill / icon, primary) |
| `pages-router/` | `<pages-router>` – shows the page of the current route |
| `dev-tools/` | `<debug-overlay>` (with `VITE_DEBUG=true`) and `<qr-generator>` |

## Design styles

Colors, the gold gradient, glass and shadows are CSS tokens in `client/src/main.css`. Shared
primitives (`.button`, `.pill`, `.primary`, `.gold`, `.muted`, …) are one constructable stylesheet:

```typescript
import { adoptDesignStyles } from "@/styles/design-styles";

adoptDesignStyles(this.shadowRoot!);
```

Buttons are native `<button>`s built with `goldButton()` (the component adopts the design styles):

```typescript
import { goldButton } from "@/components/buttons";

goldButton({ label: "Start", shape: "button", primary: true, attrs: { id: "start-btn" } });
```

Values come from the measured design spec, `agents/DESIGN.md`.
