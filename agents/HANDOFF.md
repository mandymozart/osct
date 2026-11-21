# Handoff – where the OSCT orchestrator left off

A fresh orchestrator session starts here (`C:\Development\ORCHESTRATION.md` §1, "Fresh sessions"). The previous one
updates this file before it ends; it is the only state that carries over. Long sessions are expensive (≈ $1,360 list in
four days for one orchestrator, `agents/costs.json`), so sessions are short and this file is complete.

## Starting a session (in this order)
1. Read `CLAUDE.md`, `agents/RULES.md`, `agents/PLAN.md`, the top of `agents/MEMORY.md` (older entries: `agents/archive/`, see its README),
   `C:\Developmentgents\ORCHESTRATION.md` (moved there 2026-11-01; its §11 "Usage" sets the models and caps – the orchestrator's
   model and turn/cost ceiling, a shift budget, worker caps per `complexity:S/M/L`, S tickets as a subagent, every title
   `#N`, each check once; the numbers changed twice on 11-01, so read §11 and `C:\Developmentgents\models.json`,
   never a copy) and its guides `C:\Developmentgents\guides\` (orchestrator-shift.md, worker.md,
   cost-booking.md), `agents/ORCHESTRATION.md`, then this file.
2. Find or create the session's issue and start the session title with `#N` (RULES #30).
3. `git status` in `C:\Development\osct\osct` (other sessions' uncommitted work is not yours), `git log --oneline -5`,
   `gh issue list --repo mandymozart/osct --state open`, and `https://osct.porschuetz.de/api/health`.
4. Tell the SCUTOONS orchestrator you took over (session "Arch Linux cyberdecks audio/video suite"; send by name).
5. Continue with "Next" below. Before ending: update this file, commit it, add your own cost entries to
   `agents/costs.json` (§10).

## Tools outside the repository
- `C:\Development\tools\osct\bump.py <repo root> <version> [date]` – the version bump (use the absolute root
  `C:/Development/osct/osct`; a relative path fails on Windows). Without `## Unreleased` in the changelog, add the
  entry by hand.
- `C:\Development\tools\costs\transcript_cost.py <transcript.jsonl>` – cost of a local session (§10).
- `C:\Development\tools\osct\night-log.md` – the night log up to 2026-11-01 (history, not instructions).
- Git Bash rewrites a leading `/` in `gh api` paths: write `repos/…`, not `/repos/…`.

## State (2026-11-21, end of the night shift)
- `develop` = **4.4.0**, staging healthy (FTPS deploy, `POST /api/admin/migrate` ok). This shift shipped 3.21.1 (empty
  `on`), 3.21.2 (local MariaDB init), 4.0.0 (#334 L-T5, schema 5.0: logic per scene/experience, expressions, typed
  variables, Migration5 – staging migrated), 4.1.0 (#334 L-T6, schema 5.1, plugin API 3.1: ports from the specs),
  4.2.0 (#87 store per experience), 4.3.0 (#322 T2 `osct content export`), 4.4.0 (#322 T6 `osct delivery import`).
- #87: content moved to `osct/staging/osct/` (8844 files) and `osct/staging/demo/` (6104 files); old `staging/` and
  `demo/` stay until `--delete-old` (≈ 2026-12-21). `OSCT_CONTENT_BASE_URL` set on the GitHub environment *staging*
  (`…/osct/staging`); the repo-level value still says `…/staging` – production needs `…/osct/production` before its
  first deploy.
- Staging DB: Tilman gave MariaDB access (`server/.env` `STAGING_DB_*`, never print); `scripts/db/pull-staging.sh`;
  local PHP needs `-d extension=pdo_mysql`. Raw dump `server/db-dumps/staging-20261120-204638.sql` (git-ignored, real accounts).
- The staging MCP (`osct-mcp-develop`) is stale (`list_books` not found) – update only while no MCP process runs.
- Worktree `.claude/worktrees/agent-a5e702acc37ba4bd3` (branch `feature/87-store-per-experience`, merged) has a stale
  index (251 staged changes = the branch's old state); left in place, safe to remove once checked.
- Concepts: `agents/research/2026-11-20-logic-nodes-shared-concept.md` (§5.9 ports from the code, L-T15 preview,
  L-T16 graph fragments), `2026-11-20-logic-basic-nodes.md` (B1–B9; B2/B7 done in 4.0.0, B8/B9 largely in 4.1.0),
  `2026-11-20-importer-export-plan.md` (#322 T1–T9).

## Next
1. #322: the remaining tasks of the importer/export plan (T5 delivery endpoint, T8 MCP deliveries – branches exist,
   check their state –, T9 retire `import-delivery.ts`).
2. Logic follow-ups from L-T5/L-T6: set-param action, video play, engine events, audio node, plugin-level `uses`,
   the stage following `goto`; then basic nodes once Tilman decided B1/B3–B6.

## Waiting for Tilman
- Basic nodes: B1, B3 (functions – agree the names with scutoons#702), B4, B5 (once, wait), B6.
- Demo: re-import with all 14 plugins (the local DB has 2), then export it into `fixtures/demo` (#322 decision (b)).
- #322 decision 2 (export archive).
- Remove the old GitHub variables (`CONTENT_BASE_URL`, `BUNNY_*` without `OSCT_`) – no workflow reads them any more.
- L9 for SCUTOONS; the XR idea (deck renderer + 8th Wall tracking) to debate.
