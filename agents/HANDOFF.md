# Handoff – where the OSCT orchestrator left off

A fresh orchestrator session starts here (`C:\Development\ORCHESTRATION.md` §1, "Fresh sessions"). The previous one
updates this file before it ends; it is the only state that carries over. Long sessions are expensive (≈ $1,360 list in
four days for one orchestrator, `agents/costs.json`), so sessions are short and this file is complete.

## Starting a session (in this order)
1. Read `CLAUDE.md`, `agents/RULES.md`, `agents/PLAN.md`, the top of `agents/MEMORY.md`, `C:\Development\ORCHESTRATION.md`,
   `agents/ORCHESTRATION.md`, then this file.
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

## State (2026-11-01, morning)
- `develop` = 1.62.0 (#241, merge 75057e71), on staging, health green. `main` (production) is Tilman's.
- Cost tracking accepted (#242, closed): `agents/costs.json`, a cost line in every closing comment.
- Transcripts are never deleted (`cleanupPeriodDays` 36500; never 0).
- Night arrangement with SCUTOONS: cloud credit split 50/50 (≈ $61 each of ≈ $122, the credit expires 2026-11-05);
  OSCT runs no local workers, no Docker/MariaDB/WSL/phone at night; SCUTOONS runs one local worker (#220) and two
  cloud sessions (#224, #211). Ports: OSCT 8080, 8090–8099, 5174–5199, 9333–9399, 9444/9445.
- New work runs as **cloud sessions only** (Tilman, 2026-10-31), to save extra usage. A cloud session can only be
  started from a message Tilman typed in the desktop app (not over Remote Control, not from an automated turn); otherwise
  propose it as a card.

## Next
1. **#243** – the Toggle becomes a real switch (track and knob, `role="switch"`, like the reader's
   `client/src/components/buttons/gold-switch.ts`), replacing the pill in `editor/src/lib/components/Toggle.svelte`
   and the reader's debug switch. Waits for Tilman to start its cloud session. Then: review `bug/243-…`, bump PATCH,
   CI (7 jobs), merge `--no-ff`, close with comment and cost line, lane "Review on staging", check staging, screenshots
   in the chat.
2. Backlog when Tilman wants more: #239 spread logic view; #224 translations (later); phone checks #200 and
   #184/#226; the book crumb doesn't refresh after a rename; staging's demo book is still print first.

## Waiting for Tilman
- Start the #243 cloud session.
- Should the tree's eye ("found/lost") become a switch too? (open from #241)
- Did the #241 cloud worker (`session_01AabNG9Ey3Q4BjZqbCWNAZE`) really bill extra usage although cloud credit was
  left? Check claude.ai → Settings → Usage.
- Raw transcripts "in every repo": osct is public, so where may they go (only `costs.json` in the repo, or a private
  archive)?
- #242's open parts: board field, budget per project, `SessionEnd` hook.
- The board-status workflow fails until the next release to `main` (it runs main's old copy).
