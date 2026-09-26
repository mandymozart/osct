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
| `/entries` (`category`) | `<entries-page>` | consultation | entries list by category |
| `/entry` (`entryId`) | `<entry-page>` | consultation | one entry: meta table, text, media |
| `/about` | `<about-page>` | consultation | Info: about text, colophon, tutorial restart |
| `/error` | `<error-page>` | (keeps mode) | errors and notices, see [Error page](error-page.md) |
| `/not-found` | `<not-found-page>` | (keeps mode) | unknown route or link target, with "Go to start" |

## Links

Every view has a plain URL (`services/LinkService.ts`); the address bar follows the app, and the
browser's back button goes back through the views:

| URL | Opens |
|---|---|
| `/` | the start (onboarding on a first visit, else home) |
| `/spread/<spreadId>` | scan mode on that spread |
| `/entries/<category>` (or `/entries/category/<category>`) | the entries list |
| `/entry/<entryId>` | one entry |
| `/tutorial/<step>` | an onboarding step |
| `/about` | Info |

Every link carries `?osct=<version>` (the app version it was made with). Opening a link only routes:

- unknown route, spread, entry, category or step → not-found page with "Go to start";
- the version in a link is informative only – links of any version just route;
- a link to an entry the reader hasn't found yet opens scan mode on that entry's spread (no shortcut past
  the game); entries already consulted open directly;
- a link skips the onboarding (it still comes on the next plain visit).

There is no resume prompt: the app opens the requested view (a link, or the view that was open on reload),
and a plain start opens scan mode on the last spread. Stored progress of another format: a reader for it
exists → converted, with a notice that parts may be missing; none exists → progress reset, with a notice.
- nothing from before 1.1.0 is supported (no old `?code=` links).

Printed QR codes: `https://osct.buildingfictions.com/spread/<spreadId>?osct=<version>` – the dev QR
generator in the debug overlay makes them for the current spread. The server has to answer every path
with `index.html`: `client/public/.htaccess` (Apache / FTP production) and `client/public/_redirects`
(Netlify) do that; Vite does it in dev and preview.

Two overlays have no route – they sit outside `<pages-router>` and follow the store:

- `<loading-page>` – startup and spread switch (`game.startLoading()` / `game.finishLoading()`)
- `<camera-permission-page>` – shown while the camera is being asked for or was denied (`cameraPermission`)

Base classes: `page.ts` (full page), `page-minimal.ts` (transparent, over the camera),
`consultation-page.ts` (shared layout of the consultation pages).
