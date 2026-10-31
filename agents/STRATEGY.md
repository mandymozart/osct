# Strategy – scutoons-animus-ar: a white-label AR core

Draft, 2026-10-28 (Tilman). Project name: **scutoons-animus-ar** – "animus", the bridge to animism: printed art
that comes alive.

## The idea

Tilman, 2026-10-28:
- `game.config.json` is tied to a version of a book; today's data is test data.
- A bare core app, developed as a vendor app, and **white-label** instances of it – Building Fictions (OSCT) and
  Scutoons now – tied into their brand's ecosystem (WordPress or other, their own editors). Config and content are
  loaded depending on which book or game is loaded. Each instance has its own database and its own CDN.
- **No platform** (self-service SaaS) as long as there is no demand. For now only our own projects, until requests
  come again.
- **Niche: art, graphic novels, and music that works with them.**
- **Contracted, not self-service:** people are commissioned to make content for us or in collaboration with us.
- **Hosting content and apps is a key part**: delivered under the brand's own domain (DNS), as a PWA first, as a
  native app later – or inside our own app.
- **Data sovereignty is what we sell** ("Datenfreiheit als Verkauf"): "ich möchte den Tech nutzen, ohne Tracking
  einer anderen Firma. Daten-Souveränität."
- **The goal: an instance at a click** – on the client's own servers or on selected partners' (bunny.net, Hetzner,
  Amazon, Timme Hosting, whatever fits).
- **The CDN is a decisive advantage; the audience is products that travel the world** – touring exhibitions,
  books and graphic novels sold in many countries, music on tour – where access times matter.

## Terms

| Term | Meaning | Today |
|---|---|---|
| **Core** | The white-label app: tracker, AR scene, entries, progress, preloader, offline PWA, content loader, the content contract. Brand-free. | the OSCT app, with OSCT and Building Fictions baked in |
| **Instance** | One brand's installation of the core: name, theme, domain, accounts database, CDN storage, editor. | Building Fictions (osct.buildingfictions.com); Scutoons next |
| **Title** | One book, graphic novel, exhibition or album of an instance – a content package. | `osct` (book.id) |
| **Content version** | One immutable build of a title (`<build>` = content checksum). `game.config.json` is one version of one title. | done in 1.7.6 (#5) |
| **Content contract** | The schema between editors and the core: `shared/` (types, guards), `MAJOR.MINOR`. | done in 1.7.6 |

## The model

- **White-label production, not a platform.** A project is commissioned (or a collaboration): the content is made
  by the artists with us, the core is configured for the brand, we host content and app. No self-service editor,
  no sign-up, no billing system until demand shows.
- **Delivery under the brand.** The app runs on the brand's domain (a DNS record to our hosting – like
  `osct.buildingfictions.com`, `cdn.buildingfictions.com` #17), installable as a PWA. A native app (store) later,
  per instance, when a project needs it. A title without its own brand app can live in our own app.
- **Hosting as the service.** We run the app (Kamal, one destination per instance), the accounts database and the
  CDN storage per instance; the brand owns its domain, its content and its readers' data.
- **Data sovereignty.** The readers' data stays with the brand and nobody else: no analytics or tracking of
  another company, no third-party SDK, the AR engine runs in the app (open source, no service behind it), every
  file comes from the brand's own domain and storage. This is the selling point against the platforms, whose
  white-label still runs on their servers and their terms.
- **Instance at a click, wherever the client wants.** We set up an instance – app, accounts database, CDN storage,
  domain – on the client's own servers or a partner's of their choice, from one command (later one button). That
  is not a platform: there is no shared server of ours in between; the instance is the client's. Data sovereignty
  and provisioning are the same promise.
- **Fast everywhere.** Readers meet the work in Vienna, Tokyo or New York: content from a CDN with edges near them
  (the bunny.net zone `osct` already replicates to Frankfurt, Singapore and New York), immutable versions cached at
  the edge, the PWA offline after the first visit. Access time is part of the product.
- **Our own projects first.** OSCT (Building Fictions) is the archetype, Scutoons the second instance. Each new
  instance must need no change to the core – that is the test of white-label.

## Data sovereignty – where we stand (checked 2026-10-28)

- No analytics, no tracking, no ad or social SDK in the app.
- The image tracking (8th Wall engine, MIT) is shipped with the app and runs on the device – no call to Niantic
  or any service.
- Content from the instance's own CDN storage (bunny.net, `cdn.buildingfictions.com` with #17); accounts and
  progress in the instance's own database on its own server (Kamal).
- Third parties still involved, to decide per instance:
  - Links entries embed **YouTube** (`youtube-nocookie.com`) and **Vimeo** (`dnt=1`) players – privacy modes, but
    still a request to Google / Vimeo when an entry opens. Sovereign option: click-to-load with a notice, or the
    video on the instance's own CDN.
  - Sign-in mails go through **Amazon SES** (eu-west-1, #12) – a processor, sees addresses; an own SMTP server is
    the sovereign option.
  - The CDN (bunny.net) and the server hosting are processors; contracts (data processing agreements) per
    instance.
- To keep it that way: a rule – no third-party script, font, SDK or tracker in the core; anything external is
  opt-in per instance and listed in its privacy page.
- **An instance without a CDN works** (2026-10-30, #183, #197): on the client's own server alone, the directory store
  serves the published content and the Library's uploads from one folder apart from the code – `content-store/`
  (`OSCT_CONTENT_STORE_DIR`; a Kamal volume in the container). That folder plus the database *is* the instance's data:
  easy to back up and move (docs/deploy.md "Backup"). A connected CDN has priority; without one the editor says that
  readers load without edge caching – the trade-off of "fast everywhere" against "nobody else in between".
- Each instance publishes only to its own environment (`ENV`): the provisioning sets one environment per instance,
  never an editor that writes into another instance's content.

## Where we stand (1.7.6)

Already brand-free or close:
- Content is deployed apart from the app: immutable versions on the CDN, `latest.json`, strict purge, the osct
  CLI (`docs/content-cdn.md`). The app loads the configuration at runtime.
- The content contract is versioned (`CONTENT_SCHEMA_VERSION`, lock test); the app version is information only.
- The content source is leaving the repository; CI runs on a fixture (`docs/content-out-of-git.md`).
- Progress is stored per `book.id`.

Baked in today (found 2026-10-28):
- Book and brand names in `client/index.html`, `client/vite.config.js` (PWA manifest), `types/user.ts`, the server's
  `Config.php` and `LoginMail.php`, the about/account texts of all four languages (Building Fictions, Tilman's
  imprint), `environments.ts` (osct URLs).
- Storage keys, events and element names with an `osct` prefix (~30 files: `osct-user`, `osct-progress:`,
  `osct:target-unlocked`, …) – fine as a core prefix, wrong when two titles share a browser.
- The design (`agents/DESIGN.md`: gold gradient, buttons) and Kévin's Mark the Page avatar are OSCT's, not the
  core's.
- One title per app build; the CDN layout has no title level (`<env>/<build>/`).
- One storage provider (bunny.net) inside the CLI.

## Target architecture

1. **Content contract.** `shared/` stays the contract (TypeScript types + guards, later a JSON Schema export)
   that the instance's editor produces – a WordPress export, Scutoons' own platform, or a content folder.
   MAJOR.MINOR stays the only compatibility rule.
2. **Content pipeline per instance.** The osct CLI becomes the core's content CLI: build from a source,
   validate against the contract, sync to the instance's CDN. Storage behind a small adapter (bunny.net now).
3. **CDN layout with titles.** Per instance: `catalog.json` (its titles) and per title `<title>/<env>/latest.json`,
   `<title>/<env>/<build>/…`. The app is pointed at an instance and a title.
4. **Instance configuration.** One file per instance (`instance.json`, validated like the content): name, theme
   tokens, logos and icons, languages, legal texts and imprint, API URL, CDN base URL, titles, mail sender, domain.
   Nothing brand-specific in core code. The PWA manifest and `index.html` take it at build time.
5. **Theme.** `DESIGN.md`'s values become OSCT's theme; the core ships a neutral default. Title assets (Mark the
   Page) come with the title's content.
6. **Backend per instance.** Accounts and progress API (PHP today) configured per instance: database, mail,
   branding of mails. Progress keyed by instance + title.
7. **Deploy per instance.** One core image, one Kamal destination per instance (its domain, config, secrets); PWA
   first, a native wrapper later.
8. **Provisioning.** One command creates an instance from its `instance.json`: server (any host with SSH and
   Docker – Kamal), database, storage zone and CDN, DNS records to give the brand, secrets in the deploy
   environment. Providers behind adapters: storage/CDN (bunny.net now; S3-compatible – Amazon S3 + CloudFront,
   Hetzner Object Storage – later), server (Hetzner, Amazon, Timme, the client's own). The content CLI and Kamal are
   the start of it.
9. **Music.** Audio as a first-class entity and asset type (tracks on a spread or target, a player that survives
   page turns) – the niche asks for it; not designed yet.

## Flows across spreads and books (direction, Tilman 2026-10-31)

*"Nodes I want to use for the same thing as flows in SCUTOONS – in the 3D scene too there is a goto, either directly or
with on-screen instructions to turn the page or to move somewhere in the physical world; with walls that gets
interesting; you can also go back and forth between two books. What matters is linking it well with the existing logic
of the VN and the webtoon."* – and: *"Not for OSCT."*

So the core gets **flows** like SCUTOONS': a *goto* between scenes and spreads – direct, or through an on-screen
instruction (turn the page; go to a wall, a facade, an object – the spread formats beyond `cover`/`back`, 2026-10-29) –
and between books; built on SCUTOONS' VN script logic (labels, diverts, conditions: `vn-script.ts`, `flow.ts`,
`agents/EXPRESSIONS.md` in that repo) and its webtoon flow, with the event scopes already decided (`node ⊂ spread ⊂ stage
⊂ session ⊂ book ⊂ global`). The editor's `nodes` icon is reserved for it. OSCT itself only gets a view of a spread's
logic (#239).

## Phases

**A – OSCT as the archetype (now, finishes the restructuring).** Content independent from the app, the way the
core will need it:
- finish content out of git (deploy flag, removal, history rewrite – `docs/content-out-of-git.md`);
- title level in the CDN layout (`osct/<env>/…`) before production uses it – cheap now, costly later;
- extract OSCT's instance configuration from the baked-in places above into one instance file, with OSCT as the
  only instance; namespace storage keys by title;
- OSCT's design as a theme on top of neutral defaults.

**B – the core (issues for the winter).** Instance configuration schema and loader; theme tokens; catalog and
several titles (deep links per title); storage adapter; contract export; import from an instance's editor;
per-instance deploy; **Scutoons as the second instance** – the proof that nothing OSCT is left in the core.

**C – instance at a click (the goal).** The provisioning command for the providers we use ourselves first
(bunny.net, our Kamal servers), then partners on request (Hetzner, Amazon, Timme, the client's servers); native
app wrapper per instance when a project needs it. A self-service platform only if demand ever asks for it.

## Market (searched 2026-10-28)

**Direct competitor: Artivive** (Vienna – Tilman: "direct competitor, because they are active in Vienna"). An AR
platform from the art world for artists, museums, galleries and festivals: an artwork or print is linked to a video
or animation, readers scan with the Artivive app or in the browser (WebAR from a QR code). Enterprise subscription
with **white-label WebAR** (the client's logo, colours and domain, Artivive invisible), price on request. Vienna
museums use it (Albertina, Belvedere, KHM, Sisi Museum); it pitches AR books to authors and educators. Capterra
3.8/5 from 4 reviews (2026).

**Artificial Museum** (Vienna, Tilman: "also offers AR content as a platform"). Founded 2020 by the artist-led
SystemKollektiv (Daniela Weiss, Jascha Ehrenreich): web-based AR with GPS-anchored artworks in public space,
"reclaiming the public space"; SystemKunst KG (2023) rents the framework to institutions and companies.

What neither shows on its public pages: data sovereignty (both run the experiences on their own platform), a
book-shaped model (spreads, entries to collect, reading progress, an
offline book app), the instance on the brand's own domain, CDN and database, and productions made with the
artists. Same city, same customers – our pitch is the book, the graphic novel and the music around it, made with
us, owned by the brand, with no one else watching its readers – not "AR on print" or "AR in public space".

Further afield: book apps built per publisher (Bookful with Penguin Random House, MetaBuch, Live Animations,
Gamooz, Appilog), generic WebAR builders (Blippar, Zappar, ARLOOPA, MyWebAR, Kivicube, Overly). The niche has a
high failure rate (TigerCreate, Layar gone) – one more reason for a production model over a platform.

## Open decisions (Tilman)

Each decision is an issue (label `decide`, milestone 2): 1 → #45, 2 → #46, 3 → #47, 4 → #48, 5 → #49.
Phases: A → #50 #51 #52 (with #5), B → #53, C → #54; umbrella #44.

1. Which providers the first provisioning targets (suggestion: what we run ourselves – bunny.net storage + CDN,
   a Kamal server – then Hetzner, as the cheapest European option).
2. Instances as one build each (config at build time) or one build for all domains (config at runtime) –
   suggestion: build time, it fits a few contracted instances.
3. When the core leaves this repository (suggestion: one repository with `core/` and `instances/osct/` over the
   winter, split when Scutoons runs – the core repository would be `scutoons-animus-ar`).
4. How Scutoons' platform feeds the contract (its API → the content CLI?).
5. What "inside our own app" means: a Scutoons app with several titles, or the core's neutral shell.
