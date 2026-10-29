# Components

Vanilla custom elements with shadow DOM in `client/src/components/`. They get the store from
`GameStoreService.getInstance()`, subscribe in `connectedCallback` and unsubscribe in
`disconnectedCallback` (see [Game store](game-store.md)).

| Folder | Elements |
|---|---|
| `header/` | `<game-header>` with `<mark-the-page>` (Mark, the app's main button) and `<entries-counter>` |
| `scan/` | `<spread-menu>` (looped spread menu at the bottom), `<found-indicator>` (found target without AR content) |
| `ar-bridges/` | `<ar-bridge>` – the bridge between the game store and the engine's scene (`engine/src/scene`: `ArScene`, one renderer + camera stream, spreads swapped in place, loaded lazily on the first scan; a found page of a neighbouring spread switches the spread); `ar/index.ts` builds the reader's scene with the 8th Wall tracker |
| `consultation/` | `<entries-filter>` (category dropdown), `<entries-list>`, `<entry-detail>` (meta table + content per category); helpers in `entries-model.ts` |
| `tutorial/` | `<tutorial-content>`, `<tutorial-navigation>` |
| `common/` | `<gold-illustration>` (SVG in the gold gradient) |
| `settings/` | Info page sections, one component each: `<settings-account>`, `<settings-feedback>` (sound, vibration), `<settings-graphics>`, `<settings-language>`, `<settings-install>` (home screen), `<settings-download>` (whole book), `<settings-history>` (reset book); `settings-section.ts` is their shared frame |
| `buttons/` | `goldButton()` – markup of the design buttons (button / pill / icon, primary); `<gold-switch>` |
| `pages-router/` | `<pages-router>` – shows the page of the current route |
| `dev-tools/` | With `VITE_DEBUG=true`: `<debug-overlay>` (status, settings, the panels below), `<qr-generator>`, `<load-test-panel>` (engine load test, report in `load-test-report.ts`), `<trial-panel>` (trigger trial of a printed delivery, report in `trial-report.ts`) |

## Design styles

Colors, the gold gradient, glass and shadows are CSS tokens in `client/src/main.css`; the shared primitives
(`.button`, `.pill`, `.primary`, `.gold`, `.muted`, …) are one constructable stylesheet that a component adopts:

```typescript
import { adoptDesignStyles } from "@/styles";
import { goldButton } from "@/components/buttons";

adoptDesignStyles(this.shadowRoot!);
goldButton({ label: "Start", shape: "button", primary: true, attrs: { id: "start-btn" } });
```

The values come from the measured design spec (`agents/DESIGN.md`); the rules for using them (tokens only, rem,
`.gold` on labels, glass) are `agents/RULES.md` #18.
