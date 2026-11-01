# Handoff – where the OSCT orchestrator left off

A fresh orchestrator session starts here (`C:\Development\ORCHESTRATION.md` §1, "Fresh sessions"). The previous one
updates this file before it ends; it is the only state that carries over. Long sessions are expensive (≈ $1,360 list in
four days for one orchestrator, `agents/costs.json`), so sessions are short and this file is complete.

## Starting a session (in this order)
1. Read `CLAUDE.md`, `agents/RULES.md`, `agents/PLAN.md`, the top of `agents/MEMORY.md`,
   `C:\Developmentgents\ORCHESTRATION.md` (moved there 2026-11-01; its new §11 "Usage": worker sizes S/M/L with ceilings,
   S tickets as a subagent, a shift budget of $150 list and an orchestrator ceiling of 200 turns / $100, every title
   `#N`, each check once) and its guides `C:\Developmentgents\guides\` (orchestrator-shift.md, worker.md,
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

## State (2026-11-01, mid-morning)
- `develop` = 1.62.1 (#243, merge 25883077) – the editor's Toggle is a real switch (track and knob). `main` (production)
  is Tilman's. The #243 cloud worker ran on cloud credit (`ccr_promotional`, no overage) – unlike #241's.
- Cost tracking accepted (#242, closed): `agents/costs.json`, a cost line in every closing comment. The #242 cloud
  session reported (2026-11-01) that the cost work moves to the new **agents** project (Tilman's session "Agents project
  cost tracking"); its branch `origin/docs/242-cost-tracking` (5 commits, the latest `COST-TRACKING.md`, agents/ only)
  is **not merged** – develop has an older copy from d7ad3ea4, a merge would conflict in that file. Tilman's call.
- Transcripts are never deleted (`cleanupPeriodDays` 36500; never 0).
- Night arrangement with SCUTOONS (its orchestrator is now "Orchestrator für Scutoons"): cloud credit split 50/50
  (≈ $61 each of ≈ $122, the credit expires 2026-11-05); OSCT runs no local workers, no Docker/MariaDB/WSL/phone at
  night; SCUTOONS ports 7000–7099, 4100–4199, 9500–9599. Ports OSCT: 8080, 8090–8099, 5174–5199, 9333–9399, 9444/9445.
- New work runs as **cloud sessions only** (Tilman, 2026-10-31), to save extra usage. A cloud session can only be
  started from a message Tilman typed in the desktop app (not over Remote Control, not from an automated turn); otherwise
  propose it as a card. A cloud worker leaves its report as a comment on the issue (no note arrives) – watch
  `git ls-remote --heads origin 'bug/N*' 'feature/N*'` for its branch.
- The auto-mode classifier refuses `git push --delete` (remote branch deletion) in the orchestrator session: merged
  branches stay on origin until Tilman deletes them or allows the rule (`origin/bug/240-…`, `feature/241-…`,
  `bug/243-real-switch`). Local merged branches and worktrees can be removed.

## Next
1. Nothing is in flight. Backlog when Tilman wants more (each a cloud session he starts): #239 spread logic view;
   #224 translations (later); phone checks #200 and #184/#226; the book crumb doesn't refresh after a rename;
   staging's demo book is still print first. Routine per issue: review the branch in a worktree
   (`git worktree add C:/Development/osct/osct-N <branch>`, `npm ci` in editor/client/scripts, the checks of
   `agents/ORCHESTRATION.md`), bump with `bump.py`, push, CI (7 jobs), merge `--no-ff`, close with comment and cost
   line, lane "Review on staging", health shows the version, screenshots in the chat.

## Waiting for Tilman
- Should the tree's eye ("found/lost") become a switch too? (open from #241)
- `origin/docs/242-cost-tracking`: merge the latest `COST-TRACKING.md` into develop, or leave it with the agents project?
  And the #242 session asked that the agents-project session reports to the OSCT orchestrator as its child – an
  orchestration question across projects, not decided here.
- Delete the merged remote branches (the classifier refuses it in auto mode), or allow `git push --delete` for the
  orchestrator.
- Did the #241 cloud worker (`session_01AabNG9Ey3Q4BjZqbCWNAZE`) really bill extra usage although cloud credit was
  left? Check claude.ai → Settings → Usage. (#243's did not.)
- Raw transcripts "in every repo": osct is public, so where may they go (only `costs.json` in the repo, or a private
  archive)?
- #242's open parts: board field, budget per project, `SessionEnd` hook – now in the agents project.
- The board-status workflow fails until the next release to `main` (it runs main's old copy).
