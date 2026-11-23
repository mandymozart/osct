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
| `/privacy` | Privacy & terms – **no route of the app**: a static page beside it (below) |

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
with `index.html` – except Privacy & terms (below): `client/public/.htaccess` does that (Apache – the Docker image,
[deploy](deploy.md)); Vite does it in dev and preview.

<a id="privacy"></a>**Privacy & terms** (#353; a static page since #355 – Tilman, 2026-11-23: *"privacy and terms make it
static. we can link to it from the app, so we wont have duplicate pages"*) is `privacy.html`, built by Vite next to
index.html (`client/privacy.html`, `src/privacy/privacy-html.ts`) from the app's `privacy` texts in all four languages –
no app, no i18next. The server answers it for `/privacy` and `/<experience>/privacy` (`public/.htaccess`; the dev and
preview servers too; the service worker serves the precached copy offline, never the app's shell); `privacy` is one of
the site's own paths (`RESERVED_PATHS`). A tiny script in its head picks the language as the app does (`osct-language`,
else the browser's) and shows that text; its gold × goes back where the reader came from on this site, else to the
experience's Info (`/<experience>/about`). The Info page (both links), the consent card of another site's video and the
desktop landing's footer link `/<experience>/privacy` as a plain link – in the installed app it opens in the app's window.
The book's title and author in it are the build's default experience's; on another experience's path the script takes
them from that experience's `landing.json` when its content has one.

Two overlays have no route – they sit outside `<pages-router>` and follow the store:

- `<loading-page>` – startup and scene switch (`game.startLoading()` / `game.finishLoading()`)
- `<camera-permission-page>` – shown while the camera is being asked for or was denied (`cameraPermission`)

<a id="desktop-landing"></a>**The desktop landing** (`client/src/landing/`, #293, #324, #354, #355) is what a visitor on a computer gets
instead of the app (`isDesktopVisitor`: no installed app, no touch-first pointer, no phone/tablet browser, a window
≥ 56.25 em). A computer does not enter the experience and cannot install the app – the page sends the visitor to a phone
or tablet (QR code and address). Only developers get the app on a computer: `sessionStorage["osct-desktop-landing-skipped"]
= "1"` in the browser's dev tools, for the tab.

**The skeleton delegates** (#355, Tilman 2026-11-23: *"it basically does not need to load the app at all if its on
desktop. including debugging and everything. a skeleton script could handle that right?"*). index.html's head runs, in
order: the legacy redirect, the manifest link, the landing's decision (`landing-decision-html.ts`, the twin of
`desktop-visitor.ts`'s `landingMode` – a test keeps both equal on every path), and the early preload of the chosen
entry's files. Then one loader module imports **either** the app (`src/main.ts`) **or** the landing's entry
(`src/landing/entry.ts`) – never both:

| | the head decides | the page loads |
|---|---|---|
| computer, default experience's path (`/osct/…`, or no experience in a bundled build) | `<html data-osct-landing="page">` – the static landing in index.html is this experience's | the landing's entry: no store, router, pages, dev tools, i18next, service worker |
| computer, another experience (`/demo/…`) | `data-osct-landing="skeleton"` – the same static page, the experience's parts as placeholders | the landing's entry, which fills them from that experience's data |
| phone, tablet, installed app, narrow window, a developer past it | nothing | the app, as before (its files are asked for at once, as when index.html named its script) |

The static landing (`ui/landing/landing-html.ts`'s markup in a declarative shadow root, written at build time from the build's game
configuration – English texts, the targets' images) is the first paint; a small script after it writes the address and
turns on the placeholders for another experience. The landing's entry then counts the arrival (`?s=`, as the app does –
`lp1` for its own QR code, #324), loads the experience's **landing data** (`data.ts`: the current content version's
`landing.json` – [content](content.md#landingjson) –, else derived from its game configuration with the engine's
loader, `derive.ts`, loaded only then) and **mounts the page** (`ui/landing/mount.ts`): it keeps the static page when its own render
is the same (`renderKey` – the default experience in English: no flash) or renders it in the reader's language
(`texts.ts` picks it, `ui/landing/texts.ts` – the app's `landing` texts without i18next), then fills in the book's cover,
the QR code and – loaded lazily (`ui/landing/hero.ts` with three.js) – the 3D hero. What is still loading shows a quiet skeleton placeholder (agents/DESIGN.md §6b).

**A piece of its own** (`ui/landing/`, #356 – outside `client/`, so the editor imports it without importing the reader,
RULES #32): `mountLanding(host, { data, texts, qrUrl, address, privacyHref }, { contained, styles })` imports nothing of
the app – a function of the landing's data (`LandingData`: title, author, publisher, images, cover, the hero's scan stage
with its model, plugins and looks, the shop) and a host element. The reader keeps its side in `client/src/landing/`
(the entry, when a computer gets the page, loading `landing.json` or deriving it, the links, the language). The editor's
landing workspace mounts the very same page with an experience's draft ([editor](editor.md#the-landing-workspace-356)).
The brand's tokens (`ui/brand/tokens.css`) and the font come from the reader's document; the editor passes the tokens
as `styles` for the shadow host and declares the font's faces on its document. The landing's texts are the reader's
`landing` namespace, kept beside the piece (`ui/landing/locales/`).

**The scan stage** (`ui/landing/scan-stage.ts`, #354) is the hero's right side: a three.js scene, loaded lazily after the page is up
(the `three` chunk – a placeholder until then). Its canvas fills the hero and ends at its line.
The book lies as a picture of its lacquered cover (the print layout's `cover-front` sheet, a physical material whose
lacquer and gold masks are read from the picture), turns to the stage, opens, and three of the book's spreads turn
before it lies open on the scene; a phone comes up from in front of it and scans. Its screen is its own camera's picture
(magnified, with the app's Mark and scanning ring); the model stands on the page there only, with the experience's own
`reveal` / `found` / `lost` looks (its plugins, the engine's `celebrate`). A click takes the phone – it follows the
mouse over the hero, comes to the eye when pulled down, keeps the model in its picture; another click, leaving the hero
or a resting mouse give it back. Everything it shows comes with the landing data's `hero`. Without WebGL or a model the
stage stays empty. Reduced motion: one still of the open book with the model.

Base classes: `page.ts` (full page), `page-minimal.ts` (transparent, over the camera),
`consultation-page.ts` (shared layout of the consultation pages).
