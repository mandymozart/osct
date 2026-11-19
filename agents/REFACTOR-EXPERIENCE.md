# Refactor #320 – book becomes experience (plan, step 1)

Status: **plan, for Tilman's answers** (2026-11-19). No code changes until the questions at the end are answered.

Progress (answers in #320: all accepted; plugin API 3.0; 2026-11-19 change: `sourceOfTruth` is dropped, not moved):
- [x] A – contract, engine, reader, content build (`feature/320-experience-a`): `BookData` → `ExperienceData` (own
  commit); schema 4.0 with `experience.book { author, publisher? }`, no `sourceOfTruth`; key `experience` in the
  configuration and in `latest.json` / `versions.json`; scope `experience`, `{{experience.title}}`, plugin API 3.0,
  `plugin-api.d.ts` regenerated; progress `experienceId` (format-3 reader ready, no bump); reader i18n keys
  `loadingExperience`, `experienceUpdates`; `SurfaceAnchor`; `<reader-app>`; `experience.yaml`, `buildExperience`,
  `convert-content-4.ts` + test; fixture and demo converted (the demo without `book`). Temporary: the type alias
  `BookAppearance` in `shared/types/appearance.ts` (TODO #320) until B1 and C rename it.
- [ ] B1 – server and DB · [ ] C – editor · [ ] D – content and staging
- [x] B2 – MCP (`feature/320-experience-b2`): tools `list_experiences`, `get_experience`, `update_experience`,
  `import_experience`, `put_experience_passes`, `put_experience_appearance` (no alias), param `experience` on every tool,
  `ExperienceModel`, `update_experience { experience, title?, book?: { author?, publisher? } | null }`, `sourceOfTruth` and
  the `print-first` hint gone, behaviour scope `experience`, docs/mcp.md. Temporary: `mcp/src/experience-api.ts` (TODO #320
  B1) – the integration merge deletes it, imports those names from `shared/api/editor` and renames `BookTexts` / `Books::`
  to `ExperienceTexts` / `Experiences::` in `mcp/test/php-rules.test.ts`.
Base: local `develop` at c35dc963 (2.0.3, content schema 3.0). Branch `feature/320-experience-plan`.
**It plans against the state after #319** (`agents/REFACTOR-319.md`, branch `feature/319-internal-names`, all its
recommendations approved): the code says `scene` (no more `spread`), the table `spreads` is `scenes`, `entries.scene_id`,
`books.initial_scene`, `Db::migrate` knows `RENAME TABLE` / `RENAME COLUMN`, the plugin API is 2.0 with `api.scene`,
`sceneChanged` and scope `"scene"`. 190 of the 420 files with "book" also contain "spread", so #320 starts only after
every #319 branch is merged into develop. §5 lists the overlaps.

The UI already says *experience* (editor: "Import an experience", "This experience has no scene yet"). The code, the API,
the DB, the MCP tools and the content still say `book`. This refactor moves the name, and it **splits the meaning**: the
top-level object is the experience; the printed book is optional data on it.

## 1. Inventory (git grep -i book, 2026-11-19; CHANGELOG and package-lock excluded)

6,566 lines in 445 files. Every line is put into one of three classes by a fixed rule
(`classify.mjs`, kept in the session scratchpad; the rule is below, so anyone can run it again):
- **printed book**: the line touches print data or the physical object: `author`, `publisher`, `sourceOfTruth`,
  `print`, `printed`, `cover`, `shop`, `BOOK_PAGE_MM`, "pages of the book", "scan the book", "companion".
- **ambiguous**: names whose meaning needs a decision (see the table under the counts): `bookUpdates` / `book_updates`,
  `LoginMail {book}`, `BookAnchor` / `uBook` / `seeBook`, `BookGame` / `<book-game>`, the whole-book download,
  `loadingBook`, "book content".
- **experience**: everything else. The object, its id, its rows, its routes, its scope, its texts.
- Not ours: `bookworm` (Debian image tag in `Dockerfile`), `bookmark*` (the reader's mark-the-page), `bookkeeping`, 23 lines.

| Area | Lines | Files | experience | printed book | ambiguous | not ours | test lines |
|---|---|---|---|---|---|---|---|
| editor | 1,426 | 139 | 1,360 | 52 | 14 | 0 | 321 |
| server (src + index.php) | 1,131 | 22 | 1,074 | 36 | 20 | 1 | 0 |
| server tests (`api-test.php`) | 662 | 1 | 617 | 37 | 8 | 0 | 662 |
| server DB schema (MySQL + SQLite) | 101 | 2 | 97 | 0 | 4 | 0 | 0 |
| mcp | 800 | 17 | 755 | 39 | 6 | 0 | 432 |
| client (src, sw, vite) | 391 | 74 | 250 | 53 | 88 | 0 | 116 |
| client i18n (en de fr nl) | 34 | 19 | 11 | 10 | 13 | 0 | 0 |
| client tutorials page (`public/docs/tutorials`) | 100 | 1 | 81 | 15 | 4 | 0 | 0 |
| engine | 310 | 48 | 269 | 16 | 25 | 0 | 173 |
| scripts | 200 | 29 | 162 | 29 | 6 | 3 | 90 |
| shared | 188 | 17 | 177 | 9 | 2 | 0 | 0 |
| fixtures | 42 | 20 | 35 | 6 | 1 | 0 | 0 |
| sandbox | 11 | 5 | 11 | 0 | 0 | 0 | 0 |
| docs | 535 | 18 | 462 | 50 | 22 | 1 | 0 |
| agents | 608 | 26 | 505 | 68 | 19 | 16 | 0 |
| CI workflows | 9 | 3 | 6 | 0 | 3 | 0 | 0 |
| root (README, CLAUDE.md, Dockerfile, .gitignore) | 18 | 4 | 9 | 3 | 4 | 2 | 0 |
| **total** | **6,566** | **445** | **5,881** | **423** | **239** | **23** | **1,794** |

What the classes hold, by area (main identifiers, count of tokens):

| Area | experience (rename) | printed book (stays, or moves into `book`) | ambiguous (decision in §2) |
|---|---|---|---|
| shared | `BookData` 9, `BookAppearance` 8, `config.book`, `GameConfiguration.book`, guard `root.book`, `isEntryInBook`, behaviour scope `"book"` (`BEHAVIOUR_SCOPES`), entry-text scope order, `ContentManifest.book` / `ContentVersionEntry.book` (latest.json / versions.json); `shared/api`: `/editor/books` 40, `BookSummary`, `BookList`, `BookTree`, `BookSaved`, `BookPassesSaved`, `BookAppearanceSaved`, `OtherBook`, `EnvironmentServing.book`, `replaced.book`, `incoming.book`, removal impact `book` | `author`, `publisher`, `sourceOfTruth`, `SOURCES_OF_TRUTH`, `sourceOfTruthOf` | – |
| engine | `getBook` 6, `config.book`, `bookVars` 12, `bookInMemory` 7, scope `"book"` in `plugin-runtime.ts`, `bookPasses`, `{{book.title}}` (entities.ts), `passesFor(…, book)`, forward-compatible `book.passes` / `book.appearance` | comments on the printed page | `BookAnchor` 8 / `book-anchor.ts` / `uBook` / `seeBook` (look-around: the tracked physical thing) |
| client | `bookId` 56 (progress record, `ProgressStorage`, `UserService` sync, `/progress/{bookId}`), `getBook` 45, `fillBookFields`, `bookTitle`, `bookVersion`, `bookOrder`, `BookField`, `static-splash-html` `book`, vite `shellConfig.book` | `bookCoverUrl` / `utils/book-cover.ts` (print layout's `cover-front` sheet), desktop landing `id: "book"` + `landing:shopBook`, about / landing / camera / tutorial copy about the printed book, `index.html` meta description | `BookGame` / `<book-game>` / `window.BOOKGAME`, `BookDownload` / `downloadBook` / `BOOK_TIMEOUT` / `BOOK_PARALLEL` (whole-book download), `bookUpdates` 30, `common:loadingBook`, startup / update / entry copy that says "book content" |
| editor | `bookId` 443, `/editor/books` 70, `getBook` 39, `searchBook` 20 / `BookSearch` / `book-search.ts`, `BookTree`, `BookDraft` 10, `selection.book` / `selectBook`, `StageBook` 7 (= the open scene's surfaces), `BookPanel`, `BookTexts.svelte` / `book-texts.ts` / `putBookTexts`, `bookSource` / `book-source.svelte.ts`, `bookLevel` / `PassesSource "book"`, `bookEnvironment`, `bookChanges`, `listBooks`, `importBook`, `publishBook`, `backToBooks`, `nextBook`, route `[book]` / `page.params.book`, frame protocol `bookId`, section ids `book.texts` / `book.source` / `book.passes`, `BookCover.svelte` (a card's cover = first scene) | author / publisher fields, source-of-truth control, `placeFromBookLayout` (the print layout) | – |
| server | `$bookId` 568, `book_id` 199, `/editor/books` 135, `Books` 80 (class), `BookTexts` 13, `Books::bookRow`, `touchBook`, `book_json`, `book_versions`, `BOOK_WIDE`, `BOOK_KINDS`, `pluginTypesOfBook`, `bookIdOf`, change kind `'book'`, usage kind `'book'`, errors `invalid-book`, `other-book`, `/progress/{bookId}` | `author` column + `sourceOfTruth` handling in `Books` / `BookTexts` / `Reverts`, `Scenes::PAGE_MM` ("the book's print format"), error `print-first` | `book_updates` 8 / `bookUpdates` 7 (`users`, `login_requests`, `Auth::OPTIONS`, admin CSV), `LoginMail::BOOK` / `{book}` |
| DB schema | tables `books`, `book_versions`; `book_id` in 12 tables; `book_json`; FKs `*_book_fk` (12), indexes `book_versions_book`, `changes_book`, `assets_book` | `books.author` | `users.book_updates`, `login_requests.book_updates` |
| mcp | `book` 419 (the tool param on ~40 tools), `BOOK` 44 (the zod param), tools `list_books`, `get_book`, `update_book`, `import_book`, `put_book_passes`, `put_book_appearance`, `BookModel`, `bookModel`, prompt text "the book's DRAFT", e2e | `update_book`'s author / publisher / sourceOfTruth, `print-first` explanation | – |
| scripts | `buildBook` / `build/book.ts`, `book.yaml` (content root file), schema `book`, `build.book` / manifest `book` (content-sync), CLI texts "demo book", delivery mapping `book: osct` | `BOOK_PAGE_MM` (size of a printed page), `render-layout.py` / `extract-layout.py` / `prepare-delivery.py` (the print PDF) | – |
| fixtures | `book.yaml` ×2, demo behaviour `scope: book`, `{{book.title}}`, tally option `of: book`, prose | `author`, `publisher`, `sourceOfTruth: digital` | – |
| docs, agents | docs/editor.md 155, server.md 134, content.md 92, mcp.md 55, plugins.md 40, …; RULES, STRATEGY ("Title"), SCENES terms | print, covers, the physical book | look-around.md (the anchor) |
| CI | comments, `demo.yml` names ("Demo book") | – | – |

Content folder (`OSCT_CONTENT_DIR` = `C:/Development/osct/osct-content/content`, not a git repo): `book.yaml`, `entries/`,
`layout/`, **`spreads/`** – it is still 2.x (#319 Q10: `convert:3` has not run on it). `content-demo/` next to it.
Content YAML with "book": 2 files.

CDN and store paths (checked 2026-11-19): `<zone>/<env>/latest.json`, `<env>/versions.json`, `<env>/<build>/…`,
`<zone>/assets/<id>/<asset>/v<n>.<ext>` (the Library), `<zone>/fonts/…`. **No path segment is the word "book"** – only
the id value (`osct`, `demo`). The one "book" in published files is the **key** `book` in `latest.json` /
`versions.json` (staging: `"book": "osct"`, schema 2.26; demo env: `"book": "demo"`, schema 3.0) and in each
`game.config.json` (`book: { … }`).

Browser storage: no localStorage key **name** contains "book" (`osct-progress:<id>`, `osct-user-sync:<id>`,
`osct-editor-surface-grids:<id>`, `osct-editor-last-scene:<id>`, `osct-code-autoload:<id>` hold the id value). Stored
**values**: the progress record's `bookId`; the editor's `osct-editor-sections` holds section ids `book.texts`,
`book.source`, `book.passes`. No IndexedDB; the service worker's cache names have no "book".

## 2. The target model

### The split (evaluated)

Tilman's proposal – the experience is the top-level object, the printed book is an optional `book` on it – fits every
use found:
- The reader shows **title** everywhere (splash, home-screen name, about, account) → experience.
- **author** and **publisher** appear only in copy that talks about the printed book ("the first publication by visual
  artist {{author}} … companion to the printed book", the splash's publisher line, "updates from {{author}}") and in the
  editor's card → `book`. A wall or an exhibition has no publisher; when it needs a credit line that is a later MINOR.
- **sourceOfTruth** `print` means "the scenes come from the printed layout" – meaningless without a printed book → `book`.
  An experience without `book` is digital first. (Note: staging's `osct` is set to `digital` today.)
- `passes`, `environment`, `appearance`, `id`, `title`, plugins, scenes, entries → experience.
- ISBN, edition, page format: nothing holds them today (`BOOK_PAGE_MM` / `Scenes::PAGE_MM` is a constant). Not added now
  (RULES #15) – a MINOR when needed.

### Contract (`shared/types/game-config.ts`, content schema **4.0**, Q4)

```ts
export interface ExperienceData {
  id: string;                    // storage keys, progress, the Library folder, the editor's URL
  title: string;
  passes?: PassData[];
  environment?: EnvironmentData;
  appearance?: ExperienceAppearance;   // was BookAppearance
  /** The printed book this experience accompanies – none: not a book (a wall, a room, an exhibition) */
  book?: BookData;
}

/** The printed book (print data only) */
export interface BookData {
  author: string;
  publisher?: string;
  /** print (default): the scenes come from the printed layout; digital: made in the editor */
  sourceOfTruth?: SourceOfTruth;
}

export interface GameConfiguration { version; experience: ExperienceData; initialScene; scenes; … }

/** No book: digital. A book: print unless it says digital */
export const sourceOfTruthOf = (experience: Pick<ExperienceData, "book"> | null | undefined): SourceOfTruth =>
  !experience?.book ? "digital" : experience.book.sourceOfTruth === "digital" ? "digital" : "print";
export const isEntryInExperience = …   // was isEntryInBook
```
- Guard: `experience` required, `id` and `title` strings; `book` optional object, `book.author` string, `book.publisher`
  optional string, `book.sourceOfTruth` optional enum; a top-level `author` / `publisher` / `sourceOfTruth` is an error
  (no compat). `appearance`, `passes`, `environment` checks unchanged, paths `experience.*`.
- **Renaming order matters**: `BookData` (old, the whole thing) → `ExperienceData` first, as a mechanical rename in its own
  commit; only then the new, small `BookData` is added. The new `BookData` has no `id` / `title`, so a stray old use
  fails `tsc` instead of compiling quietly.
- `ContentManifest.book` / `ContentVersionEntry.book` → `experience` (latest.json, versions.json).
- Behaviour scope `"book"` → `"experience"` (`BEHAVIOUR_SCOPES` = `scene, stage, session, experience` after #319);
  text-node template `{{book.title}}` → `{{experience.title}}`; entry-text scope order follows.
- `CONTENT_SCHEMA_VERSION` 4.0, `OLDEST_READABLE_SCHEMA_MAJOR` 4, `npm run schema:lock`, docs/content.md row.
- `GameConfiguration` and `game.config.json` keep their names (RULES #13 root documents; a CDN file name).

### Content folder

```
content/
  experience.yaml      # was book.yaml
  scenes/ entries/ entities/ plugins/ layout/
```
```yaml
id: osct
title: Onion Skin & Crocodile Tears
book:
  author: Kévin Bray
  publisher: Building Fictions
```
`layout/` (the print layout's sheets) is printed-book data and stays where it is; #319 part C replaces it by surface
references. The demo: `experience.yaml` without `book` (Q5). Delivery mappings (`scripts/import/*.yaml`): `book: osct`
→ `experience: osct`.

### Editor API (`shared/api/editor.ts`, server routes)

| Old | New |
|---|---|
| `GET /editor/books` → `BookList { books: BookSummary[], environments }` | `GET /editor/experiences` → `ExperienceList { experiences: ExperienceSummary[], environments }` |
| `BookSummary { id, title, author, book: BookData, initialScene, … }` | `ExperienceSummary { id, title, experience: ExperienceData, initialScene, … }` – no top-level `author` (it is `experience.book?.author`) |
| `/editor/books/{id}` and every `/editor/books/{id}/…` (≈ 45 routes) | `/editor/experiences/{id}` and `/editor/experiences/{id}/…` |
| `BookTree { book, scenes, groups }` | `ExperienceTree { experience, scenes, groups }` |
| `PUT /editor/books/{id} { title?, author?, publisher?, sourceOfTruth? }` → `BookSaved { book }` | `PUT /editor/experiences/{id} { title?, book?: { author?, publisher?, sourceOfTruth? } \| null }` → `ExperienceSaved { experience }` – `book: null` removes the print data; a new `book` needs `author` |
| `…/passes` → `BookPassesSaved`, `…/appearance` → `BookAppearanceSaved` | `ExperiencePassesSaved`, `ExperienceAppearanceSaved` |
| `EnvironmentServing { env, book }`, `PublishResult.replaced { book, build }`, `OtherBook`, import `incoming.book` / `existing.book`, removal impact `book` | `experience` in each, `OtherExperience` |
| errors `invalid-book`, `other-book` | `invalid-experience`, `other-experience` (`print-first` stays – it is the printed book) |
| change log kind `book`, usage kind `book` | `experience` |
| `GET/PUT /progress/{bookId}` | `GET/PUT /progress/{experienceId}` (same URL shape) |

`/editor/import/preview`, `/editor/environments`, `/admin/*`, `/auth/*` keep their paths.

### DB

| Old | New |
|---|---|
| table `books` | `experiences` |
| `books.book_json` (COMMENT 'BookData') | `experiences.experience_json` (ExperienceData, with `book` inside) |
| `books.author` | dropped – it lives in `experience_json.book.author` (the list reads the JSON) |
| `books.title`, `initial_scene` (#319), `assets_base`, `files_json`, `content_schema`, `imported_hash`, `imported_json`, `plugins_json`, `groups_json` | unchanged |
| `book_versions` | `experience_versions` |
| `book_id` in `scenes`, `entries`, `targets`, `entities`, `experience_versions`, `changes`, `assets`, `plugins`, `asset_credits`, `asset_names`, `surface_references`, `progress` (+ `page_images` while #319 keeps it) | `experience_id` |
| `changes.kind = 'book'` | `'experience'` |
| FK / index names `*_book_fk`, `*_book` | new names in the `CREATE` statements (fresh DBs). Migrated MariaDB keeps the old names (no code names them; renaming an FK needs drop + add); SQLite: `DROP INDEX IF EXISTS` old + `CREATE INDEX IF NOT EXISTS` new |
| `users.book_updates`, `login_requests.book_updates` | `experience_updates` (Q6) |

### Code names (main ones; the rest follow the same words)

- engine: `getBook` → `getExperience`; `bookVars` / `bookInMemory` → `experienceVars` / `experienceInMemory`;
  look-around `BookAnchor` → `SurfaceAnchor` (`book-anchor.ts` → `surface-anchor.ts`, `uBook` → `uAnchor`, `seeBook` →
  `seeAnchor`) – it is the found surfaces' direction, a wall as much as a page.
- reader: `progress.bookId` → `experienceId`; `BookDownload` / `downloadBook` / `getBookDownload` / `onBookDownload` /
  `BOOK_TIMEOUT` / `BOOK_PARALLEL` → `ExperienceDownload` / `downloadExperience` / … / `DOWNLOAD_TIMEOUT` /
  `DOWNLOAD_PARALLEL`; `fillBookFields` → `fillExperienceFields` (fills `{{title}}` from the experience, `{{author}}` /
  `{{publisher}}` from `book`, "" without one); root element `<book-game>` / `BookGame` / `window.BOOKGAME` →
  `<reader-app>` / `ReaderApp` / `window.READER` (the app, not a game; `index.html`, CSS, tests); `bookCoverUrl` stays
  (the printed cover sheet; null without one).
- editor: route `[book]` → `[experience]` (URL `/editor/<id>/<scene>/` unchanged); `bookId` → `experienceId`;
  `BookPanel` → `ExperiencePanel` (texts + a **Printed book** section: author, publisher, source of truth – Q8);
  `BookTexts.svelte` / `book-texts.ts` → `ExperienceTexts` / `experience-texts.ts`; `book-source.svelte.ts` →
  `source-of-truth.svelte.ts`; `BookSearch` / `book-search.ts` / `searchBook` → `ExperienceSearch` /
  `experience-search.ts` / `searchExperience`; `StageBook` → `StageScene`; `BookCover` → `ExperienceCover`;
  `selection.book` → `selection.experience`; `PassesSource "book"` / `bookLevel` → `"experience"` / `experienceLevel`;
  section ids `experience.texts`, `experience.book`, `experience.passes`; API client `listExperiences`,
  `getExperience`, `putExperience`, `putExperiencePasses`, `putExperienceAppearance`, `importExperience`,
  `publishExperience`; frame protocol `experienceId`.
- server: `Books` → `Experiences`, `BookTexts` → `ExperienceTexts`, `bookRow` → `experienceRow`, `touchBook` →
  `touchExperience`, `BOOK_WIDE` → `EXPERIENCE_WIDE`, `pluginTypesOfBook` → `pluginTypesOfExperience`, `$bookId` →
  `$experienceId` (SQL params `:experience`); `LoginMail::BOOK` / `{book}` → `TITLE` / `{title}` (still baked in –
  STRATEGY's instance config takes it later).
- scripts: `build/book.ts` → `build/experience.ts` (`buildExperience`), schema `experience` with a nested `book` object,
  content-sync `build.experience`, CLI texts "the demo".

### MCP

| Old | New |
|---|---|
| `list_books`, `get_book`, `update_book`, `import_book`, `put_book_passes`, `put_book_appearance` | `list_experiences`, `get_experience`, `update_experience` (`{ experience, title?, book?: {…} \| null }`), `import_experience`, `put_experience_passes`, `put_experience_appearance` |
| param `book` (≈ 40 tools) | `experience` (the id, like `scene`) |
| `BookModel`, prompt / instructions text ("the book's DRAFT", "Re-importing a book") | `ExperienceModel`, "the experience's draft" |

Server names in `~/.claude.json` (`osct`, `osct-staging`), `OSCT_EDITOR_TOKEN` and the resources `osct://…` do not
change. No permission allowlist names a book tool (checked the project and user settings).

### Plugin API

- Variable scope `"book"` → `"experience"` (`api.vars.get/set/all`, behaviour rules' `scope`); `{{experience.title}}`
  in text nodes. No `api.book` accessor exists, nothing else changes.
- `PLUGIN_API_VERSION`: a MAJOR. If #319's 2.0 is not on staging yet when this lands, fold both into 2.0; else 3.0 (Q3).
- `plugin-api.d.ts` regenerated (`npm run plugin-api` in editor/).

### Reader URLs, editor URLs, storage

- Reader routes (`/`, `/scene`, `/about`, `/credits`, `/tutorial`, `/entries`, `/entry`, `/error`): none says book –
  unchanged. Editor URLs `/editor/<id>/…`: unchanged (only the route param's name).
- localStorage key names: unchanged. Progress record: `bookId` → `experienceId`, **format 3** (app 3.0.0). The editor's
  section ids change → those sections fall back to their default open state once (harmless, no reader impact).

## 3. What must not change, or needs care (checked 2026-11-19)

| Thing | Found | Effect of #320 |
|---|---|---|
| URLs printed in the book | The book went to the printer (#248, 2026-11-05). Printed QR codes were named an entry point (MEMORY 2026-09-24). The reader's routes contain no "book"; links are `/<route>/<id>?osct=<version>` | **none**. (Whether `/spread/<id>` links were printed is #319's concern – the router now has `/scene` only.) |
| Production domain `osct.buildingfictions.com` | does not resolve yet; Kamal production deploy skips | none – no domain or host name contains "book" |
| Production data | CDN `production/latest.json` → 404; no production DB in use (DB secrets still open, MEMORY 2026-11-17) | nothing to migrate today. If production goes live first, the same `Db::migrate` path covers it |
| Published CDN paths | `<env>/latest.json`, `<env>/<build>/…`, `assets/<id>/…` – the id value, never the word | **paths unchanged**. The key `book` inside latest.json / versions.json / game.config.json becomes `experience`; old builds keep the old key (immutable) – see §4 |
| Bunny storage layout | zone `osct`, pull zone `buildingfictions.b-cdn.net`, Library `assets/<id>/<asset>/v<n>.<ext>`, fonts | unchanged; nothing is moved or re-uploaded. Library URLs in rows (`https://…/assets/osct/…`) stay valid |
| Stored tokens | `sessions`, `api_tokens` (hashes, `osct_` prefix), the MCP token in `~/.claude.json` | unchanged – no token or its table refers to a book |
| Accounts and consent | `users.book_updates`, `login_requests.book_updates` (opt-in) | a column rename keeps every person's choice (RULES #33); the consent text stays (Q6) |
| Reader progress | localStorage `osct-progress:osct`, server `progress` rows | key unchanged; record field renamed, read by a format-3 reader (§4) |
| Old builds on the CDN | staging `latest.json` = 2.26 build `28e3d4475afb`; demo env = 3.0 | an app 3.0.0 reads only schema 4 – staging must be republished right after the deploy (§4) |
| Editor import from the CDN | imports `game.config.json` of a build | a 3.x build is refused after this (schema MAJOR). Build and sync 4.0 content first |

## 4. Migration

### DB (`Db::migrate`, idempotent, SQLite and MariaDB)

Schema files (`schema.mysql.sql`, `schema.sqlite.sql`), in this order:
1. **At the top**, before any `CREATE TABLE IF NOT EXISTS` (after #319's own renames):
   `ALTER TABLE books RENAME TO experiences`, `ALTER TABLE book_versions RENAME TO experience_versions`, then
   `ALTER TABLE <t> RENAME COLUMN book_id TO experience_id` for the 12 tables, `ALTER TABLE experiences RENAME COLUMN
   book_json TO experience_json`, `ALTER TABLE users RENAME COLUMN book_updates TO experience_updates` (and
   `login_requests`) – the forms #319 adds: skipped when the old name is gone. **One fix needed:** the form must skip
   when the *table* is missing (a fresh DB at the top of the file): `hasColumn` on MariaDB throws on a missing table
   (`SHOW COLUMNS`), so add `Db::hasTable` and check it first.
2. The `CREATE TABLE IF NOT EXISTS` statements written with the new names and FKs to `experiences` (a fresh DB gets the
   final shape; an old one already has the tables).
3. Later statements that name `books` (`ADD COLUMN plugins_json`, `imported_json`, `groups_json`, `DROP COLUMN
   tutorial_json`) rewritten to `experiences` – they are skipped anyway, the column state is already right.
4. At the end: `UPDATE changes SET kind = 'experience' WHERE kind = 'book'`; SQLite `DROP INDEX IF EXISTS
   book_versions_book / changes_book / assets_book` + `CREATE INDEX IF NOT EXISTS …_experience`.
5. `ALTER TABLE experiences DROP COLUMN author` – **after** the data step below (it reads `experience_json`, not the
   column, so the order only matters for keeping the file readable).

MariaDB renames a table that others reference and updates their FKs (InnoDB); renaming an FK / PK column with
`RENAME COLUMN` (MariaDB ≥ 10.5.2) keeps the constraint. SQLite ≥ 3.26 rewrites FK references on `RENAME TABLE`
(`legacy_alter_table` off, the default). **Both are verified on real data before staging** (§5 B1).

**Data step** (JSON rewrites cannot be written once for both SQL dialects): a PHP class `Migration4` (or an extension of
whatever #319 built for its behaviour-rule rewrite), run by `Db::migrate` after the statements, each part guarded by its
own predicate so it does nothing the second time:
- `experiences.experience_json`: a top-level `author` / `publisher` / `sourceOfTruth` moves into `book` (`{ author,
  publisher?, sourceOfTruth? }`); a row that has `book` already is skipped.
- Behaviour rules in `data_json` of `entities`, `targets`, `scenes`: `scope: "book"` → `"experience"`; text nodes'
  `{{book.title}}` → `{{experience.title}}` (walk the JSON, change only those keys – no text search).
- The change log: the same two rewrites in `before_json` / `after_json` (kind `experience` rows reshaped like the
  experience row, entity / target rows walked like their tables) – so a revert never writes the old shape back.
- Progress rows are **not** rewritten: the app reads the old record (format 3 reader) and its next save writes the new.
- Plugin **sources** (`plugins.source`) and the compiled `plugins_json` are not rewritten: B1 lists which use the scope
  `"book"` (read-only, before) – the author re-saves them in the Code tab (as #319's plugin API step). Staging's `osct` has
  6 sources (contact-shadow, hover, lifts, paper, reveal, scroll-texture); `demo` is still on schema 2.25 on staging
  (`migrate-first`), so its sources are unread.

Q9 asks whether the data step runs on deploy (recommended) or as a plan → apply endpoint like `migrate-3`.

### Content folder and the one-off converter

`scripts/src/convert-content-4.ts` (`npm run convert:4`), modelled on `convert-content-3.ts` (text edits that keep
comments, a test, removed again after the real folder is converted):
- `book.yaml` → `experience.yaml`; `author`, `publisher`, `sourceOfTruth` move under `book:`.
- every `scope: book` → `scope: experience` in entries' / entities' / scenes' YAML; `{{book.title}}` →
  `{{experience.title}}`.
- plugins' TypeScript: reports each `"book"` scope use (file and line) – a person edits it (code is not rewritten by text).
- delivery mappings `scripts/import/*.yaml`: `book:` → `experience:` (in the repo, by hand).

The fixture and the demo are converted by the worker with the same script (proves it). The real folder
(`osct-content/content`) is still **2.x**: run `convert:3` (#319 Q10), build, then `convert:4`, build – one sitting,
orchestrator with Tilman's go; a copy of the folder first.

### Staging (osct.porschuetz.de, `osct` on schema 3.0, `demo` on 2.25)

1. Before: a DB backup (docs/deploy.md "Backup"); B1's dry run on a copy of staging's editor tables (Q9); the plugin list.
2. If `demo` should survive: run `migrate-3` on it first (it is on 2.25 – #319's step), else re-import it from the
   demo env after the deploy.
3. Merge to develop and push → CI → Kamal deploys 3.0.0 → the entrypoint runs `Db::migrate` (renames + data step).
4. `/api/health` shows 3.0.0; `GET /editor/experiences` lists `osct` with `book.author`; spot-check scenes, entries,
   the change log, the Library.
5. Publish `osct` to `staging` from the editor (writes a 4.0 build, latest.json with `experience`). Until then the
   staging reader says the content is older than the app – minutes.
6. Re-run the deploy once (or push a no-op bump) so the app shell (home-screen name, static splash) is baked from 4.0
   content: the Docker build reads `latest.json` at build time and finds 2.26/3.0 content before step 5.
7. Demo env: the `demo.yml` workflow builds and syncs `fixtures/demo` (4.0) to `demo`.
8. Re-save the plugin sources that used `"book"` (list from step 1). Staging's stored `environment.world: "cafe"`
   (removed in 1.104.0) is unrelated stale data – noted, not touched.

### Production

Nothing to migrate today (no content, no live DB). The first production deploy creates the final schema from the
`CREATE` statements. If production goes live before #320: the same `Db::migrate` path runs there, with the same backup
and checks as staging, after Tilman's go.

### The reader's stored progress (format bump)

- App 3.0.0 → `PROGRESS_FORMAT` 3 (= app MAJOR, RULES #10). `ProgressRecord.bookId` → `experienceId`.
- `PROGRESS_READERS[3] = readRecord`; formats 1 and 2 read by the same reader (it never read `bookId` – the id comes from
  the caller). `keptAsItWas` treats `bookId` → `experienceId` as kept, so the rename shows **no** "progress converted"
  notice.
- Server: `Progress::put` checks `record.experienceId === {experienceId}`. An old app still open on a phone gets 400
  `invalid-record` on its next sync until it reloads (the new-version notice does that) – staging testers only.
- `progress-record.test.ts` covers a format-2 record with `bookId` (read, not converted, not notified).

## 5. Order of work and workers

**Precondition:** all #319 branches merged into develop and green; staging on #319's state. #320 runs on an integration
branch `feature/320-experience`; workers branch from it and merge back; develop gets it when A–C are in and checked
(as #319's 3.0 cut). The plugin API and schema decisions (Q3, Q4) are fixed before A starts.

**How** (as #319): symbol renames with a small ts-morph script (declarations + every reference across packages); file
moves with `git mv`; PHP, SQL, Svelte markup, YAML, comments and copy by hand from a grep list, per hunk. Mechanical
renames and logic changes never share a commit. At the end `git grep -i -w -E "book|books|bookId|book_id"` may hit only
the allowed list: printed-book uses (`book.author`, `BookData`, `bookCoverUrl`, `BOOK_PAGE_MM`, `Scenes::PAGE_MM`,
`print-first`, the reader's copy about the printed book, `landing:shopBook`, layout scripts), CHANGELOG, MEMORY,
SCENES "Today", `bookworm`, `bookmark*`.

| Worker | Owns (no one else edits these) | Work | Size | Verified by |
|---|---|---|---|---|
| **A – contract, engine, reader, content build** | `shared/types`, `shared/guards`, `shared/text`, `shared/content-schema.json`, `engine/`, `client/`, `scripts/`, `fixtures/`, `sandbox/`, docs/content.md, plugins.md, look-around.md, content-cdn.md, game-store.md, managers.md, tracking.md, i18n.md | 1) mechanical: `BookData` → `ExperienceData`, `config.book` → `config.experience`, `getBook` → `getExperience` across **all** packages incl. editor / mcp imports (so every package compiles); 2) new `BookData` + guard + `sourceOfTruthOf` + schema 4.0 + lock; 3) behaviour scope / `{{experience.title}}` / plugin API version, regenerate `plugin-api.d.ts`; 4) engine look-around `SurfaceAnchor`; 5) reader: progress format 3, `ReaderApp`, download names, onboarding / about / landing / account read `book.*`, i18n keys (Q7); 6) scripts: `experience.yaml`, `buildExperience`, content-sync `experience`, `convert-content-4.ts` + test; convert fixture and demo with it | L – ≈ 1,500 lines, ~200 files (≈ 120 turns) | from `client/`: fixture build, `npx tsc --noEmit`, `npx vitest run`; `scripts/`: `npx vitest run`, `npm run build:content`; editor `npm run check` + `plugin-api -- --check` and mcp `tsc` still pass (step 1 only); reader smoke (390 × 844, fake camera): splash with title / author / publisher, scan, entries, a format-2 progress record in localStorage survives without a notice |
| **B1 – server and DB** (after A) | `server/`, `shared/api/` (names per §2 – C reads, does not edit), docs/server.md, docs/admin.md, docs/deploy.md | routes `/editor/experiences`, classes, every SQL statement, `Db::hasTable`, schema files, `Migration4` data step, `experience_updates` (Q6), errors, change / usage kinds, `Progress` | L – ≈ 1,900 lines (+ 660 test lines) (≈ 130 turns) | `php server/tests/api-test.php` (SQLite) + CI's MariaDB job; **an upgrade test**: the pre-#320 schema file (`git show develop:server/api/db/…`) loaded with rows (experience, scenes, entries, a `book` change row, a progress row, a behaviour rule with `scope: book`), then `Db::migrate` twice → names renamed, data kept, JSON reshaped, second run a no-op – on SQLite and on local MariaDB 10.11 **and** 11.4 (docker-compose, `OSCT_MARIADB_VERSION`); the dry run on a copy of staging's editor tables (Q9) |
| **B2 – MCP** (after A, beside B1) | `mcp/`, docs/mcp.md | tool and param names, `ExperienceModel`, `update_experience`'s `book`, prompts / instructions, results' texts, tests | M – ≈ 800 lines, 430 of them tests (≈ 50 turns) | `npx tsc --noEmit`, `npx vitest run`; the e2e test against B1's server once both are on the integration branch |
| **C – editor** (after A, beside B1/B2) | `editor/`, docs/editor.md, `client/public/docs/tutorials/index.html` (+ its image names) | route `[experience]`, API client per §2, stores and panels, `ExperiencePanel` with the Printed book section (Q8), `StageScene`, search, frame protocol, section ids, history kinds | L – ≈ 1,450 lines, 140 files (≈ 120 turns) | `npx svelte-check`, `npx vitest run --testTimeout=30000`, `npm run build`; against B1's server locally: list, open a scene, edit title / author, switch the printed book off and on, publish to `local`, undo a texts change; screenshots |
| **D – content and staging** (orchestrator, after merge, with Tilman) | the content folder, staging | §4: `convert:3` + `convert:4` on `osct-content`, build and sync; staging backup, deploy, checks, publish, demo; RULES / STRATEGY / SCENES / README / CLAUDE.md wording; MEMORY entry; CHANGELOG 3.0.0 | M (≈ 40 turns, mostly waiting) | the staging checklist in §4; the reader on the phone; `/api/health` |

A goes first and alone (it touches every package's imports). B1, B2, C start from A's merge and own disjoint folders;
the only shared file, `shared/api/editor.ts`, belongs to B1 – C codes against §2's names and asks B1 for changes.
The version bump (3.0.0) and CHANGELOG `## Unreleased` are the orchestrator's at merge time (one bump for the whole cut).

**Overlap with #319** (it must be merged first): 190 files carry both words – engine `game-config.ts`, `ar-scene.ts`,
`plugin-runtime.ts`, `plugins.ts`; shared `behaviour.ts` (scopes), `entry-text.ts` (scope order), `game-config.ts`;
editor `book-search.ts` (#319 removes `spreadWhere`), `scenes.svelte.ts` (`spreadsOnBooks` → #319's `scenesOnBook` →
`scenesOnExperience`), `[book]/[scene]/+page.svelte`, `PassesPanel` (`PassesSource "spread"` and `"book"`),
`mock-tracker.ts` (`StageBook` next to `spreadId`); every server SQL statement (#319 renames `spreads` / `spread_id` in the
same lines as `book_id`); both schema files and `Db::migrate` (#320 reuses #319's RENAME forms and its behaviour-rule
rewrite); `api-test.php`; MCP tests; the demo's `tally` plugin (`of: ["book", "spread"]`); every docs/*.md;
`PLUGIN_API_VERSION` and `CONTENT_SCHEMA_VERSION` (Q3, Q4).

## 6. Risks

1. **MariaDB renames of FK / PK columns on real data** – the one step that can fail on staging. Mitigation: the upgrade
   test on 10.11 and 11.4, the dry run on staging's copy, a backup, the deploy at a time Tilman can look. Fallback in the
   schema file: drop FK, rename, re-add (only if the test shows it is needed).
2. **`hasColumn` on a missing table throws on MariaDB** – a fresh DB would fail at the top of the file. Fixed by
   `Db::hasTable` (B1), covered by CI's fresh-DB MariaDB job.
3. **The quiet rename** – `ExperienceData` and the new `BookData` in the same diff could let an old use compile. The
   two-commit order (§2) makes it a type error.
4. **Meaning lost by search-and-replace** – a printed-book "book" renamed, or an experience "book" left. The class table
   (§1) and the final allowed-list grep; reviewed per hunk.
5. **Staging gap** – between the deploy and the republish the staging reader refuses the old content, and the app shell
   carries fallback texts until the second deploy. Minutes; staging only.
6. **Stored plugin code** using scope `"book"` or recorded against the old plugin API MAJOR is not loaded until re-saved.
   The list before the deploy says which.
7. **The change log** holds old shapes; without the rewrite a revert would write a top-level `author` back and the next
   publish would fail the guard. The data step rewrites it (tested).
8. **Old apps open on phones** (PWA) get 400 on progress sync until they reload. Staging testers only.
9. **Demo on staging is still 2.25** (`migrate-first`) – it must be migrated by #319 first or re-imported after.
10. **The real content folder is two MAJORs behind** (2.x) – `convert:3` then `convert:4`; a copy first, it is not in git.
11. **Size and parallel work** – ≈ 6,000 lines while other features continue: every feature branch that touches the
    editor API or the content after A has merged needs a rebase. Best run when no other editor / server branch is open.

## 7. Questions for Tilman

1. **The shape.** The experience is the top level (`id`, `title`, `passes`, `environment`, `appearance`, plugins …);
   `book` is optional and holds the print data. Options: (a) `book = { author, publisher?, sourceOfTruth? }`, the title
   only on the experience; (b) `author` and `publisher` stay on the experience as general credits, `book` holds only
   `sourceOfTruth` (and later ISBN); (c) flat as today, only renamed. **Recommendation: (a)** – author and publisher show
   only in copy about the printed book; a wall has neither. ISBN / page format are added when something uses them.
2. **Source of truth.** (a) inside `book`; an experience without a book is digital first; (b) stays on the experience,
   default print. **Recommendation: (a)** – "print first" needs a print.
3. **Plugin and behaviour scope** `"book"`: (a) `"experience"`, with `{{experience.title}}` in text nodes; (b) keep
   `"book"` as the scope's name; (c) a neutral `"saved"`. **Recommendation: (a)**. Version: fold into #319's plugin API
   2.0 if that is not on staging yet, else 3.0.
4. **Versions.** Content schema 4.0 (3.0 is already published – demo env, staging DB) and app 3.0.0 with progress format
   3; or amend 3.0 in place. **Recommendation: 4.0 / 3.0.0** – nothing compatible is lost, and the numbers tell the truth.
5. **The demo.** (a) no `book` – it becomes the example of an experience that is not a book (digital first by itself);
   (b) keep a `book` block. **Recommendation: (a)**; its title "The Demo Book" could become "The Demo".
6. **The newsletter opt-in** `bookUpdates` / `book_updates` ("news about Onion Skin & Crocodile Tears"): (a) rename to
   `experienceUpdates` / `experience_updates` (values kept, consent text unchanged); (b) keep it – it is news about the
   book as a product. **Recommendation: (a)** – a Scutoons instance has no book, and the column rename changes no one's
   choice.
7. **Reader copy.** (a) rename the i18n **keys** that mean the content (`common:loadingBook` → `common:loading`, …) and
   keep OSCT's **texts** ("Loading book", "the printed book") – an instance's own copy comes with STRATEGY's instance
   config; (b) also make those texts neutral now ("Loading…"); (c) touch neither. **Recommendation: (a)**.
8. **Editor: a "Printed book" switch** in the experience settings ⚙ – on: author, publisher, source of truth; off:
   removes `book` (two steps, it deletes print data). (a) build it in C; (b) only rename, `book` changes only through
   the API / MCP. **Recommendation: (a)** – small, and without it no non-book experience can be made in the editor.
9. **The data step** (JSON reshape, scope and template rewrite, change log): (a) automatic in `Db::migrate` on deploy,
   after a dry run on a copy of staging's **editor tables** (no `users`, no personal data leaves the server); (b) a plan →
   apply endpoint per experience like `migrate-3`, which you run. **Recommendation: (a)** – lossless, idempotent, and only
   two experiences exist; the dry run shows the plan.
10. **STRATEGY's word "Title"** (one book, graphic novel, exhibition or album of an instance) is the same thing:
    rename it to **Experience** there too. **Recommendation: yes** – one word for one thing.
11. **When.** (a) right after #319 is merged and on staging, with the content folder's `convert:3` + `convert:4` in one
    sitting; (b) later, after other open editor work. **Recommendation: (a)** – every week adds files that say book, and
    no reader is out before Tokyo.
