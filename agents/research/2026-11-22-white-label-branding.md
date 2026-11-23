Status 2026-11-22: research (#347, under #44 / #51 / #52), no code changed. Read from OSCT `develop` at 011b86d3 (6.2.2,
content schema 6.0); `https://osct.porschuetz.de/demo/` and its manifest fetched once to check what a second experience
gets today. Guesses are marked *(guess)*; browser behaviour not tested on a device here is marked *(verify on device)*.

# Per-experience branding and wording – inventory, pitfalls, a shape

Tilman (#347): *"each experience has a specific branding and wording … a way to edit theme and text. its somehow part of
appearance. also app logo goes there for the manifest … and favicon too … identify the potential pitfalls."*

## 0. The finding in one paragraph

Since #343 one build serves `/osct/` and `/demo/`, but **everything that paints before the content loads is OSCT's,
written at build time**: on staging `/demo/` serves *Onion Skin & Crocodile Tears* as `<title>`, as the iOS home-screen
title and in the static splash (checked 2026-11-22); its manifest (`ReaderManifest.php`) names the demo but carries
OSCT's icons and black colours. After the bundle loads, only `<title>`, `description`, `apple-mobile-web-app-title` and the
manifest link follow the experience (`experience-meta.ts`). Colours, logo/eye, icons, favicon, font, the about/colophon,
the landing's shop, the onboarding's wording and the sign-in mail stay OSCT's for every experience. The content model has
no branding field at all: `experience.appearance` is the AR *looks* (reveal / found / lost), not a theme.

## 1. Inventory – what is brand or book-specific today

B = build time (from the default experience `VITE_EXPERIENCE` or a constant), R = runtime from content, H = hard-coded.

### Page head, manifest, icons

| What | Where | Kind |
|---|---|---|
| `<title>` "Onion Skin and Crocodile Tears - Kevin Bray (buildingfictions)" | `client/index.html:7` | H (replaced at runtime for non-default experiences only, `experience-meta.ts:36`) |
| `<meta description>` "…Kévin Bray's book…" | `client/index.html:8` | H (runtime for non-default, `experience-meta.ts:37`, English template) |
| `theme-color` `#000000`, iOS status bar `black` | `client/index.html:10,15` | H |
| `apple-mobile-web-app-title` | `client/index.html:14` ← `vite.config.js:76-79` (`experience.title`, fallback "Onion Skin & Crocodile Tears") | B; runtime for non-default (`experience-meta.ts:38`) |
| `apple-touch-icon` 180×180 opaque PNG | `client/index.html:16`, `public/assets/icons/apple-touch-icon.png` (11.6 kB) | H – never changed at runtime |
| Favicon: `favicon.ico` 48×48 (3.9 kB), `favicon-32.png` | `client/index.html:18-19`, `public/assets/` | H – no `/favicon.ico` at the root |
| Build manifest: `id`/`start_url`/`scope` `/`, name = default title, description "…Kévin Bray's book Onion Skin…", `background_color`/`theme_color` `#000000`, icons 192/512 any + 512 maskable | `client/vite.config.js:87-103` | B + H |
| Per-experience manifest: id/start/scope `/<id>/`, name from the experience once published, **build icons and colours** | `server/api/src/ReaderManifest.php:17-21, 43-56` | R (title, author) + H |
| Manifest link swapped for non-default experiences | `client/src/main.ts:28`, `:236`; `utils/experience-meta.ts:32-42` | R |
| Precache: `assets/{ui,illustrations,sounds,icons}/**`, `bf.svg`, `favicon.ico` | `vite.config.js:107-112` | B |

### First paint and landing

| What | Where | Kind |
|---|---|---|
| Static splash (title / author / publisher in gold, the eye) | `index.html:32` ← `vite.config.js:147-160`, `utils/static-splash-html.ts:26,33-55` | **B, default experience only** – not replaced for `/demo/`; the app then continues the onboarding *after* the splash step (`main.ts:207-213`), so a demo reader never sees the demo's own splash |
| The eye (header and splash), 395×169 PNG, sized by tokens `--onboarding-icon-width/height` 12.33 × 5.28 rem | `public/assets/ui/onboarding/icon.png`, `main.css:87-96` | H ("placeholder until Kévin's icon", `static-splash-html.ts:22`) |
| Old Mark the Page image 129×125 | `public/assets/ui/mark-the-page/scan.png`, `header/mark-the-page.ts:10` | H |
| Onboarding drawing (gold line art) | `public/assets/illustrations/tutorial-step-1.svg`, `utils/onboarding.ts:21` | H |
| Building Fictions logo `bf.svg` – unused since #297, still precached | `public/assets/bf.svg`, `vite.config.js:111` | H |
| Desktop landing: title split "as on the book's title page" (`& / and / und / et / en`), gold shimmer, author | `components/desktop-landing/desktop-landing.ts:181-191, 354-355` | R |
| Landing QR colours `#000000` on champagne `#f5e7c8`, caption `#3b2a12` – literal colours against RULES #18 | `desktop-landing.ts:147-148, 306, 312` | H |
| Shop: book + T-shirt → `https://buildingfictions.com` placeholder, product drawings, phone preview | `desktop-landing/landing-config.ts:8, 28-35`, `public/assets/ui/landing/` | H |
| Legacy redirect inline script, last experience in `localStorage` `osct-experience` | `utils/legacy-redirect-html.ts:66-75`, `shared/api/experience-paths.ts:65-68` (`bk1 → osct`, `d<n> → demo`) | B |

### Colours, fonts

| What | Where | Kind |
|---|---|---|
| Gold gradient `#f5e7c8 → #7f6032 → #d2ae5a → #f3cc94`, accent `--gold-3`, shimmer, bronze / gold glows, black app background, greys | `agents/DESIGN.md` §1, §5–6; `client/src/main.css:36-78` | H (tokens – good: one place) |
| Gold in SVG illustrations via `var(--gold-1…4)` | `components/common/gold-illustration.ts:109-124` | H (follows tokens) |
| **Gold in the engine** (the marginalia card's canvas) | `engine/src/scene/card-flight.ts:238-241` | H – does not follow CSS tokens |
| Default look colours (edge, glow, tint, spark) | `shared/types/appearance.ts:108-124` | H defaults, already overridable per experience in `experience.appearance` |
| Font ABC Areal from `https://buildingfictions.b-cdn.net/fonts/abc-areal`, `@font-face` written into index.html, SW cache `osct-fonts` | `utils/font-face-html.ts:12`, `vite.config.js:175-183`, `sw/service-worker.ts:48,150`, `main.css:15` | B (`VITE_FONT_BASE_URL`); licence: Dinamo's permission "for this collaboration release" (MEMORY 2026-11-16) |
| Reader is dark only (no `prefers-color-scheme` in `client/src`) | – | – |

### Wording (i18n, `client/src/i18n/locales/{en,fr,nl,de}`, ~265 lines in en)

| What | Where (en) | Kind |
|---|---|---|
| Info text "…the first publication by visual artist {{author}}… companion to the printed book" | `about.json:3` | H per language, title/author filled at runtime |
| Colophon: app development (Tilman), design (Virginie Gauthier, Rudy Guedj), glossary editing, font "Areal, Dinamo + Are.na", publisher "Building Fictions, Amsterdam", **ISBN 978-90-833756-7-0**, "© Building Fictions, {{author}}, 2027" | `about.json:16-23`, rendered `pages/about-page.ts:52-68` | **H – OSCT's colophon shows in every experience** |
| "Marginalia" as the name of entries / glossary ("In the context of this publication, these entries are called ‘marginalia’") | `tutorial.json:8`, `entries.json:5,11,18`, `header.json:2,4,5`, `scan.json:4`, `about.json:12` | H – book-specific vocabulary |
| "book" / "printed book" / "publication" (experience kind) | `tutorial.json:4,22,26`, `camera.json:4,12`, `common.json:5`, `settings.json:3-5,13,31,36-37`, `startup.json:2-4`, `update.json:5`, `entry.json:10`, `landing.json:3,9,19,21` | H – wrong for a wall, a room, an exhibition |
| "Onion sky" (a feature named after the book) | `settings.json:12,14`; engine/shared `onionSky` | H (label only is wording; the field name can stay) |
| "Receive updates from Building Fictions" (the one update option, key `buildingfictions`, #325) | `account.json:4`; `types/user.ts:13`; `settings-account.ts:8`; mail `LoginMail.php:19,30,41,52` | H – instance-level |
| Landing copy (placeholder) | `landing.json` | H |

### Server, editor, docs

| What | Where | Kind |
|---|---|---|
| Sign-in mail: `TITLE = 'Onion Skin & Crocodile Tears'`, `AUTHOR = 'Kévin Bray'` – **used although the request carries the experience since #343** | `server/api/src/LoginMail.php:59-60, 74, 85, 92` | H |
| Mail colours gold `#d2ae5a`, `#f3cc94`, `#f5e7c8`, black | `LoginMail.php:90-96` | H |
| `MAIL_FROM_NAME` default "Onion Skin & Crocodile Tears", `MAIL_FROM` | `server/api/src/Config.php:42-43` | env, instance-level |
| `TITLE` = the instance's CDN prefix `osct` (STRATEGY calls the *instance* "title" and the *experience* "title" in different places) | `Config.php:26-28, 134-137` | env |
| Editor "OSCT Editor" / "OSCT Admin", no favicon of its own | `editor/src/app.html:8`, `editor/src/routes/(app)/+layout.svelte:33` | H – vendor/instance, monochrome by RULES #38 |
| Docs site "OSCT docs" | `client/public/docs/index.html:6,14,16` | H – vendor |
| Arrivals: counted per source, no experience column | `server/api/src/Arrivals.php`, `services/ArrivalService.ts` | – |
| Privacy page / imprint in the reader | none found | – |

## 2. What the content model and the editor carry per experience today

- `ExperienceData` (`shared/types/game-config.ts:155-185`): `id`, `title`, `passes?`, `environment?`, `appearance?`,
  `book?` (`author`, `publisher?` – `:190-195`), `recognition?`, `logic?`, `variables?`. Per entry: `title`, `body`
  (Markdown), `author`, `caption`, `tags`. Root: `credits` (picture credits). **One language only** – content has no
  translations; the UI has four.
- `experience.appearance` = `Partial<Record<"reveal"|"found"|"lost", AppearanceData>>` (`shared/types/appearance.ts:36,53`) –
  the entities' looks. Its guard flags any non-moment key (`appearance.ts:195-196`, ignored only in the reader's lenient
  mode, `shared/guards/game-config.ts:121-126`); the API and the MCP replace it whole (`PUT …/appearance`,
  `put_experience_appearance`).
- Editor: `ExperienceTexts.svelte:102-117` edits title and the printed book (author, publisher);
  `panels/AppearancePanel.svelte` the three looks; `EnvironmentPanel.svelte` world and onion sky. `ColourField` exists.
- **Missing for a brand:** theme colours, logo (header / splash / landing), app icon (+ generated sizes), favicon,
  theme / background colour, font choice, wording overrides, colophon and links (shop, publisher site), a published copy
  of all that the server can read without the CDN.

## 3. Pitfalls

1. **Build time vs runtime.** `index.html` (title, description, iOS title, icons, theme colour, font, static splash) is
   written once for the default experience. Any other experience shows OSCT until the bundle and its configuration load,
   and its splash step is skipped (above). A pure-runtime fix cannot reach what is read before scripts run or without
   scripts: the static splash, link previews (OG/Twitter tags – crawlers run no JS; there are none today), and possibly
   iOS's home-screen sheet *(verify on device)*.
2. **Offline shell.** The service worker answers every offline navigation with the one precached `/index.html`
   (`sw/service-worker.ts:75,158`) – a server-rendered head per experience helps only online; offline, the head is the
   default's again unless an inline script restores the last-seen brand (from `localStorage`) before first paint.
3. **Installs.** One install per manifest `id`; scopes nest (`/` contains `/demo/`). OSCT's installed app has `id` `/`
   (#343 kept it so existing installs stay one app); moving OSCT to a per-experience manifest (`/osct/`) makes a second
   app beside it (MEMORY #343 open item). Icons/name changed later reach installed apps slowly: Chrome/Android refreshes
   a WebAPK's manifest on its own schedule and may ask the user about an icon change; iOS never updates a home-screen
   icon *(verify on device)*. A brand's icon should be final before readers install.
4. **iOS.** "Add to Home Screen" takes the `apple-touch-icon` link and `apple-mobile-web-app-title` from the page; with a
   touch icon link present it takes that over manifest icons, and iOS before 16.4 reads no manifest icons at all
   *(verify on device)*. Today the link is OSCT's for every experience and nothing swaps it. Must be an opaque PNG
   (180×180); WebP is not reliable there *(guess)*. Status-bar style is read at install.
5. **Favicons are cached hard and separately** by browsers; a swapped icon needs a new URL (version or hash in it). The
   reader has no `/favicon.ico` at the root (browsers ask for it by themselves – 404 today).
6. **Icon sizes and the maskable safe zone.** Maskable: the visible part is the centre circle of 80 % (≈ 410 px of 512), on
   an opaque background colour; "any" icons transparent; apple-touch opaque. A logo (wide, like the eye 395×169) is not
   an icon – brands need two assets (a square mark and a wide logo), or the editor must pad.
7. **The media pipeline converts every upload to WebP** (#298, `docs/content.md` "The image rule", 2048 px, metadata and
   ICC dropped). App icons and favicons need PNG at exact sizes (and ICO optionally) → a separate use (e.g. `fit: icon`)
   that keeps PNG and writes the size set; the browser canvas can make PNGs, so the sizes can come from one square source
   in the editor like #331's stacks.
8. **Where the server gets a published brand.** `ReaderManifest.php:35-41` reads `experiences.title/experience_json` –
   the **draft** row – once any version exists: a draft's later title change reaches the manifest before it is published.
   `experience_versions` stores no JSON; the published configuration is on the CDN / content store. Brand data for
   manifests, the head and mails needs a published copy the API can read (a column written at publish).
9. **Caching / versioning of brand assets.** As content paths inside the configuration they land in the immutable
   `<build>/` folder and in the SW's content cache (good). But the head and the manifest need them before the
   configuration – they must point at those versioned URLs (from the published copy), not at fixed names. CDN icons in a
   manifest are cross-origin – allowed; no CSP today.
10. **Theme tokens are wider than "a colour".** The gold is a 4-stop gradient used as text clip, plus shimmer, bronze and
    gold glows (`main.css:36-78`), plus the engine's card (`card-flight.ts:238-241`), the illustrations, the QR card, the
    mail. A brand colour picker that sets only `--color-accent` leaves gold everywhere. CSS custom properties set on
    `:root` at runtime do reach the shadow roots (they inherit) – the engine's canvas does not.
11. **Contrast.** The reader is dark only and paints over a camera picture (glass buttons, no fill). A light or pale brand
    accent fails on white pages of the book in the camera, a dark one on black. The editor should check contrast of the
    gradient's stops against black (and warn), not refuse.
12. **Illustrations tied to Onion Skin:** the crocodile eye, the tutorial drawing, the landing's book / T-shirt drawings
    and preview, the scroller "match page numbers" text (pre-scenes wording). Each needs a brand slot or a neutral default.
13. **Font licensing per brand.** Areal is licensed for this collaboration, not per domain (MEMORY 2026-11-16) – using it
    for the demo or a client brand is likely not covered *(guess – ask Dinamo)*. The font folder sits at the instance zone's
    root, shared by staging and production; the `@font-face` is in the build's head. A per-experience font means runtime
    `FontFace` loading, a font folder per brand, a Latin-only gap (Japanese for Tokyo still open).
14. **Wording overrides vs translations.** UI text has 4 languages; content has one. An override written in English only
    leaves a French reader with the app's French wording ("Marginalia" next to a brand's "Notes"). The source of truth
    becomes split: app JSON + content overrides; renaming an i18n key in an app release silently drops overrides. The
    i18n strings are raw HTML in templates (`about-page.ts:31` `<p>${t("about:infoText", params)}</p>`; i18next escapes
    only the interpolated values) – an override string from content would be injected HTML. Typed keys
    (`i18n/resources.d.ts`) do not cover content.
15. **Schema.** A new optional `experience.brand` is a MINOR (6.1): the experience guard reads no unknown field, an older
    app ignores it. Putting brand keys *inside* `appearance` is also tolerated by the reader's lenient guard, but the
    strict build and API refuse non-moment keys and the whole-object `PUT …/appearance` / MCP tool would need rework –
    mixing two meanings in one field. Every `shared/` change bumps and re-locks (RULES #10). No compat needed before
    Tokyo, but none is required here.
16. **Editor vs brand colours.** RULES #38: the editor is monochrome, gold belongs to the reader. Brand colours are data in
    the editor (swatches, a reader preview), never its UI colour.
17. **Instance vs experience.** Several "brand" items are the *instance's*, not a book's: domain, mail sender address
    (SES domain verification, DMARC), the update option "Building Fictions" (#325, column `buildingfictions_updates`),
    imprint / privacy, the editor and docs names, the font licence holder, the CDN zone. Per-experience overrides of those
    would mislead readers (a demo reader subscribing to "Building Fictions" news).
18. **Mails** ignore the experience (`LoginMail.php:59-60`) although `POST /auth/request` carries it (#343).
19. **Analytics/arrivals** have no experience dimension; `lp1` (landing) is shared by every experience.
20. **Per-host later.** Subdomains only after white label (#343). A host-based brand changes manifest `id`/`scope`
    (new installs), cookies and the SW scope; brand data should not depend on the path so host mapping is config only.
21. **The printed QR (RULES #39).** `/?s=bk1 → /osct/` forever; `osct` stays the default experience of
    osct.buildingfictions.com; its install keeps `id` `/`. Any brand work that makes the build neutral must keep OSCT's
    look for `/`, `/osct/` and the installed app – i.e. OSCT's brand must be in OSCT's content *before* the build defaults
    turn neutral, or the printed book opens a neutral app.

## 4. A proposed shape

**Where it lives.** `experience.brand` (schema 6.1, optional), beside `appearance`; in the editor shown in the
experience's Inspector **under an "appearance" heading** (Brand: theme · logo · icon · texts) so it reads as "part of
appearance" without mixing the moments' contract:

```yaml
brand:
  colors: { accent: ["#f5e7c8", "#7f6032", "#d2ae5a", "#f3cc94"], background: "#000000" }  # glows derived from accent
  logo: brand/logo.png          # wide mark: header, splash, landing (content path → versioned, cached)
  icon: brand/icon.png          # square source ≥ 1024 px; the editor writes icon-192/512, maskable-512, apple-180, favicon-32 (PNG)
  font: instance | system       # later: a licensed folder
  texts:                        # per language, an allow-list of UI keys, plain text + *emphasis*
    en: { "entries:marginalia": "Marginalia", "about:infoText": "…" }
  colophon: ["Design: …", "ISBN …"]   # lines, language-neutral
  links: [{ kind: shop, url: "…", label: "The book" }]
```

**Reader at runtime.** After the configuration loads: set the CSS tokens on `:root`, swap logo, `theme-color`,
favicon and apple-touch-icon links, add the text overrides with `i18next.addResourceBundle(lang, ns, …, true, true)` (only
allow-listed keys, escaped, falling back to the app's own translation in the reader's language), hand the accent to
the engine's card. Store a small snapshot per experience in `localStorage` so an inline head script paints the right
colours/title/splash offline and on the next visit.

**Before the bundle (online).** Apache already serves the image (Dockerfile): route `/<experience>/…` navigations to a
small PHP page that fills the built `index.html`'s head and static splash from the **published** brand (a copy written at
publish), and serve `/manifest.webmanifest` from PHP too (keeps `id` `/`, default experience's brand) next to
`ReaderManifest` (now with brand icons and colours). Adds OG tags. Offline stays the precached shell + the snapshot.

**Instance level** (#51 `instance.json`): mail sender, update-option label, imprint/privacy, editor/docs name, font
licence, default brand. Experience brand overrides only what a book may own.

**Staged plan (smallest first).**
1. *Fixes, no schema:* no OSCT splash text for a non-default experience (inline check against the default, a plain
   loader instead); `LoginMail` with the requested experience's published title; `ReaderManifest` from the published
   copy, not the draft; landing QR colours as tokens; drop the unused `bf.svg` from the precache (ask, RULES #1).
2. *Theme + icons (6.1):* `brand.colors`, `brand.logo`, `brand.icon` with PNG sizes from the editor (`fit: icon`, no WebP);
   reader applies at runtime; manifest and runtime links take them. Demo gets its own brand – the proof.
3. *Head on the server:* PHP-rendered head/splash per experience, dynamic `/manifest.webmanifest`, OG tags, snapshot script.
4. *Wording:* colophon and links into content (move OSCT's colophon/ISBN/shop out of i18n), then the allow-listed
   per-language text overrides with a coverage view in the editor.
5. *Fonts, mail look, arrivals per experience, instance file* (#51/#52) – OSCT's gold becomes OSCT's brand data; the core
   default turns neutral last.

## 5. Decisions for Tilman (each with a recommendation)

1. **Experience or instance?** Rec: both – a brand per experience with instance defaults; mail sender, update option,
   imprint/privacy, editor/docs name, font licence stay instance-only.
2. **Where in the schema?** Rec: `experience.brand` (MINOR 6.1), shown in the editor under the appearance heading – not
   keys inside `appearance` (that field is the three moments, replaced whole by API and MCP).
3. **Neutral default now or later?** Rec: OSCT's gold stays the build default until OSCT's content carries its brand and
   Scutoons needs neutral (#52); protects the printed QR (RULES #39).
4. **Head rendering:** runtime only, or a PHP-rendered head per experience? Rec: PHP (Apache is already there) + the
   localStorage snapshot for offline – the only way to get the splash, iOS and link previews right.
5. **Wording overrides:** any key, or an allow-list? Per language? Rec: allow-list (book/brand words: marginalia, book,
   info, landing, onboarding intro), plain text with *emphasis* only, per language, falling back to the app's translation
   of the reader's language; the editor shows which languages are missing.
6. **App icon source:** one square upload, sizes made in the editor as PNG (exempt from the WebP rule)? Rec: yes, plus a
   separate wide logo.
7. **OSCT's install identity:** keep `id` `/` for OSCT and serve its manifest dynamically (new icon reaches existing
   installs), or move OSCT to `/osct/` (a second app on phones that installed)? Rec: keep `/`; also settles #343's open
   "the `/` app opens the last experience" by pointing `/` at the default for installed launches *(to design)*.
8. **Font per brand:** what does Dinamo's permission cover – the demo and other brands, or only OSCT? Rec: Areal only for
   OSCT until confirmed; other experiences the system font; a licensed font folder per brand later.
9. **Legal/imprint and colophon:** the reader has none and OSCT's colophon (ISBN, © Building Fictions) is in i18n for
   everyone. Rec: colophon lines per experience in content now; imprint/privacy per instance with #51.
