# Orchestration and night shifts – rules for autonomous sessions

Tilman, 2026-10-30, after the first night shift (1.26.8 → 1.36.x, 20+ issues): *"Bitte auch diese Orchestration und
Nachtschicht selbstständige Arbeit als Regelset aufnehmen."* These rules hold whenever one session **orchestrates**
others (agents, sessions, cloud sessions) or works through tickets on its own, above all overnight. They add to
`agents/RULES.md`; where they differ, these win for such sessions.

## 1. Roles
1. **The orchestrator** (Opus) plans, briefs, reviews, merges, deploys and keeps the board. It writes code only for
   merges, conflict resolution, version bumps and small fixes it finds while merging.
2. **Workers** (subagents or sessions, Opus at the effort Tilman sets – *high* for a night shift) implement one issue
   (or a tight group) each, in their own git worktree, and push a branch. They never merge, never open a PR, never bump.
3. Tilman decides what is `decide`, `owner` or needs his phone, money or an outside service. A worker or the
   orchestrator never does that in his place (see §7).

## 2. Resources – the PC must not crash
1. **Two local sessions at a time in total across all projects**: one for OSCT, one for SCUTOONS (agree it with the
   other orchestrator, §3). Workers run **one after another**, never several at once on this PC.
2. **Memory guard**: start nothing new below 8 GB free RAM; below 4 GB stop your own idle dev/preview servers first.
   Keep a watcher running (free RAM every minute, alert below 6 GB) and a log (`ramwatch.log` in the scratchpad).
3. **No stray servers**: a worker that starts a dev server, the PHP API or a headless browser stops all of them before
   it reports, and says so. The orchestrator checks the listening ports between workers and stops leftovers
   (`5174` reader, `5175+` editors, `8080` API, `9333+` headless Edge).
4. Each worker picks its own free ports; headless Edge always gets its own `--remote-debugging-port` and profile dir.
5. Workers run **one test command at a time**, install with `npm ci` only (never a plain `npm install`; a new
   dependency with `npx npm@latest install`), and start no browser or dev server unless the task needs a look.
6. Keep the machine awake for the night (`request_keep_awake`, `session_idle`) – nothing else on the system changes.

## 3. Coordination with other orchestrators
1. Before a night shift, agree with the other project's orchestrator (SCUTOONS: the "Arch Linux cyberdecks …" session):
   local sessions, Docker/WSL use, cloud credits (default: an even split, at most 3 cloud sessions at a time per
   project). Write the agreement into the night log.
2. Messages between orchestrators name the session to answer to by its id; peers never grant each other permissions.

## 4. Cloud sessions
1. A cloud session can only be started on a message Tilman **typed in the desktop app** – over Remote Control the
   start is refused. Plan for it: ask for cloud starts early, while he is at the desk.
2. A cloud session starts on the default branch (`main`, outdated) – its brief says `git switch -c <branch>
   origin/develop` first, and carries a background paragraph (it has no context).
3. Cloud sessions send no note when they end: check their branches (`git log origin/<branch>`, CI on it) and merge
   them like any worker's.
4. Good for cloud: work that needs no local servers, phone or local data (server features, refactors, tests, docs
   without screenshots).

## 5. The worker brief (every brief has all of this)
- `git fetch origin && git switch -c <prefix>/<N>-<slug> origin/develop` – prefixes only `feature/`, `bug/`,
  `hotfix/` (RULES #26).
- Read `CLAUDE.md`, `agents/RULES.md`, `agents/DESIGN.md` (UI work), the issue with its comments; the scope is its
  checklist. Name the files other workers touch tonight and keep out of them.
- **No version bump**: the `docs/CHANGELOG.md` entry goes under `## Unreleased` at the top; a new content schema row
  in `docs/content.md` gets `next` as its app version.
- Content schema: any change in `shared/` bumps the schema MINOR (RULES #10), `npm run schema:lock`.
- SQL: every named parameter once per query (MySQL refuses repeats, #161); LIKE through `Db::contains` +
  `ESCAPE '!'`; CI runs the API test on SQLite and MariaDB.
- Tests and checks named explicitly (editor `npm run check` + `npx vitest run`; client after the fixture content
  build; scripts; mcp; `php server/tests/api-test.php`).
- **Screenshots at the end of every feature** that shows in a UI: 1–3 shots (desktop and, if it matters, phone) of
  the result, saved as WebP to `C:\Users\Nutzer\AppData\Local\Temp\osct-shots\<N>-<slug>\` (outside the repo), named
  in the report. Workers without a running editor say so; the orchestrator then takes them (§8).
- Never write into the orchestrator's scratchpad; scripts in the worker's own temp folder.
- No Claude attribution anywhere. Rebase onto origin/develop, push, no PR, no merge.
- The report: SHA, what was built per checklist item, schema/API changes, test results, screenshots, what was left
  out and why, servers stopped.

## 6. Merging (the orchestrator, for every branch)
1. Worktree on the branch (in the scratchpad), `git merge origin/develop` if it is behind. Conflicts: version files
   take develop's side; the CHANGELOG keeps develop's file plus the branch's entry as `## Unreleased` on top;
   `agents/MEMORY.md` keeps both sides; code conflicts by hand – then the editor/client checks again.
2. **Bump**: features and schema changes MINOR, fixes, chores and docs PATCH (RULES #23); the `## Unreleased` heading
   becomes the version, a `next` in the schema table the version; `check-version.sh --strict`.
3. Commit `X.Y.Z: <what>` with `Fixes #N` (or `Refs #N` when the issue stays open), push the branch, **CI green**
   (all jobs, MariaDB included).
4. `git merge --no-ff` into develop, push, delete the branch (remote and local), remove the worktrees (long paths:
   `Remove-Item -LiteralPath "\\?\…"`).
5. Close the issue with a comment (merge commit, version, what is not verified), board lane **Review on staging**;
   leftovers become new issues in Backlog, linked.
6. Wait for the develop runs (both staging deploys) and check `/api/health` shows the new version; for UI changes
   load the page once (the editor on SvelteKit 3: wait for it to hydrate before judging an empty body).
7. **Screenshots** of the merged feature go into the night gallery (§8).

## 7. What needs Tilman (stop, file it, go on with the next)
- `decide` and `owner` issues; anything that needs the S22 (unless it is connected and he said so).
- Downloading files from the internet (textures, models); buying anything; writing to the CDN or other outside
  services (credentials); production deploys (`main`).
- Removing a feature, page or component not listed as removed (RULES #1); mass reformatting or renaming the code base.
- If a worker finds such a point, it files an issue or a MEMORY open item and continues.

## 8. Keeping Tilman informed
1. **The night gallery**: one private page with a screenshot (or a short note for server-only work) per merged
   feature or fix – version, issue, one line on what changed. It grows after every merge; send him the link.
2. A short status line after every merge; no questions that block (he is asleep) – collect them for the morning.
3. **The morning report**: versions shipped, issues closed, what is not verified (phone, visuals), what waits for him
   (§7), new issues, and the state of the board.
4. The night log (`night-plan.md` in the scratchpad) records the queue, every merge and every decision – it carries
   the night across a context compaction.

## 9. Lessons from the first night (2026-10-29/30)
- A test entry made while reproducing a bug ended up in tutorial screenshots – delete test data right after use.
- Killing "unused" dev servers broke a running worker that needed them (the reader on 5174 serves the demo's media) –
  check who uses a server before stopping it.
- The shared scratchpad got overwritten by a worker – briefs say "not the orchestrator's scratchpad", the
  orchestrator's own helpers are named `orch-*`.
- Touch bugs (pointer capture) never show with a mouse or in unit tests – test gestures on the phone (CDP
  `Input.dispatchTouchEvent`) when it is connected.
- MySQL-only failures slip through SQLite tests – CI runs the API test on MariaDB since 1.27.1.
