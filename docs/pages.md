# Pages

Pages live in `client/src/pages/` and sit inside `<pages-router>` (`main.ts`). **One page is open at
a time.** Routes are defined in `client/src/router.ts`; every route declares its game mode, and
`game.router.navigate()` sets route and mode together. `game.router.close()` returns to scan mode.

```typescript
game.router.navigate("/entry", { key: "entryId", value: "metafiction" });
```

| Route | Page | Mode | |
|---|---|---|---|
| `/` | `<splash-page>` | idle | start for returning readers: the splash (the onboarding steps before the first button), then scan mode |
| `/tutorial` (`step`) | `<tutorial-page>` | idle | the onboarding steps – the app's own (`utils/onboarding.ts`, texts in the `tutorial` namespace) |
| `/scene` (`sceneId`) | `<scene-page>` | scan | scan mode: found indicator, scene menu |
| `/entries` (`category`) | `<entries-page>` | consultation | entries list by category |
| `/entry` (`entryId`) | `<entry-page>` | consultation | one entry: meta table, text, media |
| `/about` | `<about-page>` | consultation | Info: about text, settings (account, sound and vibration, graphics, language, home screen, download, reset book), colophon |
| `/error` | `<error-page>` | (keeps mode) | errors and notices, see [Error page](error-page.md) |
| `/not-found` | `<not-found-page>` | (keeps mode) | unknown route or link target, with "Go to start" |

## Links

Every view has a plain URL (`services/LinkService.ts`), below the path of its experience – every experience is at its
own path (#343, [content-cdn](content-cdn.md#which-experience-the-reader-opens)): `/osct/scene/s1`, `/demo/entry/…`.
The address bar follows the app, and the browser's back button goes back through the views:

| URL (below `/<experience>`) | Opens |
|---|---|
| `/` (`/osct/`) | the start (onboarding on a first visit, else the splash → scan mode) |
| `/scene/<sceneId>` | scan mode on that scene |
| `/entries/<category>` (or `/entries/category/<category>`) | the entries list |
| `/entry/<entryId>` | one entry |
| `/tutorial/<step>` | an onboarding step |
| `/about` | Info |

A link without an experience (every code and link made before #343) is moved to one before the app starts
(`utils/experience-path.ts` `redirectLegacyAddress`, `history.replaceState`):

| Address | Becomes |
|---|---|
| `/?s=bk1` (the printed book's code) | `/osct/?s=bk1` – the source's experience (`SOURCE_EXPERIENCES`, `shared/api/experience-paths.ts`); the arrival is counted and `s` taken out as before |
| `/?s=d1` | `/demo/?s=d1` |
| `/?s=<another source>` | the default experience (`VITE_EXPERIENCE`) |
| `/` | the experience this browser opened last (`localStorage` `osct-experience` – the installed app starts at `/`), else the default |
| `/scene/<id>`, `/entry/<id>`, `/about`, … (with or without `?osct=`) | the same route of the default experience (`?s=` in it: the source's experience) |
| `/x/<experience>/…` (the prefix of #87) | `/<experience>/…` |

Every link carries `?osct=<version>` (the app version it was made with). Opening a link only routes:

- unknown route, scene, entry, category or step → not-found page with "Go to start";
- the version in a link is informative only – links of any version just route; nothing from before 1.1.0 is supported
  (no old `?code=` links);
- a link to an entry the reader hasn't found yet opens scan mode on that entry's scene (no shortcut past
  the game); entries already consulted open directly;
- a link skips the onboarding (it still comes on the next plain visit).

There is no resume prompt: the app opens the requested view (a link, or the view that was open on reload),
and a plain start opens scan mode on the last scene. Stored progress of another format: a reader for it
exists → converted, with a notice that parts may be missing; none exists → progress reset, with a notice.

Printed QR codes: `https://osct.buildingfictions.com/osct/scene/<sceneId>?osct=<version>` – the dev QR
generator in the debug overlay makes them for the current scene; the admin's *A new code* makes them with a source
([admin](admin.md)). The book's own code, `https://osct.buildingfictions.com/?s=bk1`, has no experience and opens
`/osct/` forever (RULES #39). The server has to answer every path
with `index.html`: `client/public/.htaccess` does that (Apache – the Docker image, [deploy](deploy.md)); Vite does
it in dev and preview.

Two overlays have no route – they sit outside `<pages-router>` and follow the store:

- `<loading-page>` – startup and scene switch (`game.startLoading()` / `game.finishLoading()`)
- `<camera-permission-page>` – shown while the camera is being asked for or was denied (`cameraPermission`)

<a id="desktop-landing"></a>**The desktop landing** (`components/desktop-landing/`, #293, #324) covers the app for a visitor on a computer
(`isDesktopVisitor`: no installed app, no touch-first pointer, no phone/tablet browser, a window ≥ 56.25 em) until they
choose "Open the app here" (remembered for the tab, `skipLanding`); `main.ts` waits for it before the start. Its first
paint does not wait for the bundle (#343, Tilman 2026-11-22): index.html decides and shows it at once –

| | before the bundle (index.html) | when the bundle arrives |
|---|---|---|
| computer, default experience's path (`/osct/…`, or no experience in a bundled build) | the static landing (`<html data-osct-landing>`), not the static splash | `<desktop-landing>` renders the same page underneath (`landing-html.ts`), then takes the static page's scroll position and removes it once its images and the QR code are there (≤ 2 s) – no flash; the QR code, the drifting images, install and the book's cover come with it |
| computer, another experience (`/demo/`) | the static splash (the static page carries the default's texts) | `<desktop-landing>` as before |
| phone, tablet, installed app, narrow window | the static splash | unchanged – no landing |

The decision is an inline script in the head after the legacy redirect (`landing-decision-html.ts`, written from
`desktop-visitor.ts`'s rules – a test keeps both equal case by case); the static page is `landing-html.ts`'s markup in a
declarative shadow root with the design primitives' CSS (`styles/design-css.ts`), written at build time from the build's
game configuration – English texts (`landing` namespace), the targets' images of the content the build read. A small
script after it writes the address and makes "Open the app here" work before the bundle (the static splash then shows as
for anyone else). In another language `<desktop-landing>` swaps in its texts when it takes over. When it decides
otherwise than the head (a window made narrow meanwhile), it removes the static page and the splash shows.

Base classes: `page.ts` (full page), `page-minimal.ts` (transparent, over the camera),
`consultation-page.ts` (shared layout of the consultation pages).
