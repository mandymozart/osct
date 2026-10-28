# OSCT – Agent entry point

AR companion app for Kévin Bray's book *Onion Skin & Crocodile Tears*: app in `client/`, content build and
osct CLI in `scripts/`, accounts API in `server/`, shared content contract in `shared/`. The book content
lives outside the repository (`OSCT_CONTENT_DIR`); `fixtures/content/` is the test fixture.

Before working, read:
- `agents/RULES.md` – project rules (stack, naming, versions, issues, what must not be removed)
- `agents/PLAN.md` – the restructuring plan (phases, checkboxes, open decisions)
- `agents/MEMORY.md` – dated decisions and open items
- `agents/DESIGN.md` – measured design spec (colors, gold gradient, sizes, buttons) – before any styling
- `agents/reference/README.md` – design PDF, rendered frames and extracted placeholder images
- `README.md` – the index of `docs/` (architecture, content, CDN, server, deploy, i18n, tests)

First, before any edit: find or create the session's GitHub issue, put it in its lane on the OSCT board and
start the session title with its number (`#N …`) – `agents/RULES.md` #30.

While working:
- Tick items in `PLAN.md` as they land (`[~]` in progress, `[x]` done).
- Bump the version and add an entry to `docs/CHANGELOG.md` for every shipped change (`RULES.md` #23 – changes
  only in `agents/`, `docs/` or `*.md` need no bump).
- Add new decisions to the top of `MEMORY.md` with a date; add rules to `RULES.md`.
- Never remove a feature, page, component or manager that the plan does not list as removed.
  If something seems obsolete, add it as an open item in `MEMORY.md` instead.
