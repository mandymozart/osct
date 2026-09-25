# Pages

Pages live in `client/src/pages/` and sit inside `<pages-router>` (`main.ts`). **One page is open at
a time.** Routes are defined in `client/src/router.ts`; every route declares its game mode, and
`game.router.navigate()` sets route and mode together. `game.router.close()` returns to scan mode.

```typescript
game.router.navigate("/entry", { key: "entryId", value: "metafiction" });
```

| Route | Page | Mode | |
|---|---|---|---|
| `/` | `<home-page>` | idle | start screen for returning readers |
| `/tutorial` (`step`) | `<tutorial-page>` | idle | onboarding / tutorial steps from `content/steps` |
| `/spread` (`spreadId`) | `<spread-page>` | scan | scan mode: found indicator, spread menu |
| `/entries` (`category`) | `<entries-page>` | consultation | entries list by category or bookmarked |
| `/entry` (`entryId`) | `<entry-page>` | consultation | one entry: text, media, bookmark, note |
| `/about` | `<about-page>` | consultation | Info: about text, colophon, tutorial restart |
| `/spreads` | `<spreads-page>` | scan | dev view: spreads with progress |
| `/index` | `<index-page>` | consultation | dev view: spreads and targets (former index) |
| `/error` | `<error-page>` | (keeps mode) | errors and notices, see [Error page](error-page.md) |
| `/not-found` | `<not-found-page>` | (keeps mode) | unknown route |

`<loading-page>` is a separate overlay (`game.startLoading()` / `game.finishLoading()`), not a route.

Base classes: `page.ts` (full page), `page-minimal.ts` (transparent, over the camera),
`consultation-page.ts` (shared layout of the consultation pages).
