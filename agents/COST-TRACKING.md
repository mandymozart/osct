# Cost per issue – a proposal (#242)

Tilman, 2026-10-31: *"Messen wie viel Cloud- und Usage-Credits bei diesen Aufgaben verbraucht werden … wie ich pro
Issue am besten für jedes Projekt den Preis tracken kann."* Also: *"zusätzlich sollten orchestrator sessions auch
getrackt werden. projekt budget sollte ggf. teil des repos werden"* and *"ich werde mehrere services in zukunft parallel
benutzen und die sollen alle kosten tracken."*

**Status: proposal only. Nothing has been built.** Tilman decides; then it becomes issues.

Each lead below is marked **verified** (checked in the docs or in a real session today), **guess** (likely, not checked)
or **open** (has to be measured before anyone relies on it).

---

## 1. Summary

- **Every Claude Code session already works out its own cost at list price** (`costBasis: "list"`), down to the
  model and token type. Nothing needs inventing. The work is to collect that number per session and attach the
  issue number to it.
- **Cloud sessions: you can read the cost now, and for past sessions too.** Each finished turn leaves a `result` event
  with `total_cost_usd`. Any session on the account can read it with `list_events` (claude-code-remote MCP), so an
  orchestrator can read its workers' cost. The session title carries `#N`. Verified on a real worker session.
- **Local sessions: compute it from the transcripts.** `~/.claude/projects/*/*.jsonl` has the token counts of every
  response. List price × tokens gives exactly the number Claude Code computes itself (checked to the cent). The
  transcripts are deleted after 30 days by default.
- **Plan usage has no price per call, and it stays an estimate.** Every row records *list USD* (an estimate) and
  *what paid for it* (plan, extra usage, cloud credit). Real money (extra usage EUR, cloud credit USD) is only ever
  taken from the bills, once a month, and is spread over the rows. It is never mixed into the estimate columns.
- **The record:** one append-only CSV ledger per project in the repo (`agents/costs.csv`), plus the budget in the
  same repo (`agents/COSTS.md`). There is a cost line in the issue's closing comment, and a number field on the board.
  The orchestrator writes it at merge. A local hook catches sessions that no orchestrator sees.
- **Orchestrator sessions get their own rows**, booked to their own issue (a "shift" issue), never hidden inside the
  workers' numbers.
- **Not only Claude:** the ledger's columns are service-neutral (`service`, `unit`, `quantity`, `est_usd`). Flora,
  other AI APIs and GitHub Actions minutes go in the same file, each through a small adapter.
- **Tomorrow:** set `cleanupPeriodDays` to 365 (keeps the raw data), and add one step to the orchestrator's merge
  routine: read the worker's `total_cost_usd` and put it in the merge comment. No code needed for either. See §8.

---

## 2. What is measurable

### 2.1 Cloud session `result` events – **verified, the best source**

When a turn ends, a cloud session writes a `result` event. `list_events(session_id, kinds: ["result"])` returns it.
Measured today on `session_01AabNG9LQhaNiESL1TuMzMP` ("#28+#29 Typed boundaries and test gaps", 2026-10-29):

| field | value |
| --- | --- |
| `total_cost_usd` | **12.158** |
| `modelUsage["claude-opus-5-5"].costBasis` | `"list"` |
| `modelUsage[…]` tokens | input 334 · cache write (1 h) 291,637 · cache read 38,098,701 · output 110,212 (32,985 of them thinking) |
| `model_usage_since_last_result` | same as above (a one-turn session) |
| `num_turns`, `duration_ms`, `duration_api_ms` | 175, 1,559,578, 1,132,644 |
| `subagent_stats` | spawned 0 |

- Checked against Anthropic's price list (Opus 5.5: input $4, 1 h cache write $8, cache read $0.20, output $20 per
  MTok): 0.0013 + 2.333 + 7.620 + 2.204 = **$12.158**. Identical. **Verified.**
- The session's title (`#28+#29 …`) comes from `list_sessions` / `get_session`. That covers the mapping to issues.
  `get_session` itself has **no** cost field. **Verified.**
- This works for **past** sessions, so all cloud work so far can be costed today. **Verified** (the session above is
  two days old).
- **Open:** in a session that runs several turns (resumed, or messaged by the orchestrator), is `total_cost_usd` the
  running total or the cost of the last turn? The field `model_usage_since_last_result` suggests running totals with
  a delta beside them. Until it is checked on a multi-turn session, add up `model_usage_since_last_result` across all
  `result` events. That is correct either way.
- **Guess:** `total_cost_usd` includes the session's subagents (Agent tool, workflows). `subagent_stats` sits on the
  same event. Check it on a session that spawned some.
- **Open:** a session's own *current* turn has no `result` yet. A session can only report its earlier turns this way
  (see §2.3 for the rest).

### 2.2 Local transcripts `~/.claude/projects/<cwd-slug>/<session-id>.jsonl` – **verified**

Checked on this session's own transcript:

- Each `assistant` line has `message.model`, `message.id`, `requestId`, `sessionId`, `cwd`, `gitBranch`, `version`,
  `isSidechain` and `message.usage`. That holds `input_tokens`, `cache_creation_input_tokens` (split into
  `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`), `cache_read_input_tokens`, `output_tokens`
  (thinking included, `output_tokens_details.thinking_tokens`), `speed` and `inference_geo`.
- **One response is written as several lines** (here 21 `assistant` lines for 8 message ids). Count each `message.id`
  once, or the cost comes out double or triple. **Verified.**
- Cost = Σ tokens × list price per model and token type: base input, 5 m write, 1 h write, cache read, output. The
  formula is the one Claude Code uses (it reproduces §2.1 exactly). Adjustments: × 1.1 for US-only `inference_geo`;
  fast mode (`speed`) is priced differently; Haiku 5.5 costs more above 100k-token prompts. Keep the price table in one
  file and update it when prices change.
- **Issue number:** the transcript has no session title (no title record in this one). **Verified.** It does have
  `gitBranch`, and RULES #26 puts the issue number in the branch (`feature/42-…`). The title itself is in the status
  line's `session_name` (§2.4). **Guess:** `/rename` writes a title record into the transcript. Check it.
- **Project:** the folder name is the cwd (`C--Development-osct-osct` → osct). Worktrees sit under the project folder.
- Subagents' transcripts: **guess:** `<session-id>/subagents/*.jsonl` next to the main file. Read those too.
- **Gaps (guess):** helper calls that WebFetch makes with a small model, and other "auxiliary" requests, don't show
  up as `assistant` lines. OTel counts them (`query_source: auxiliary`). They are likely small.
- **Deleted after 30 days** (`cleanupPeriodDays`, default 30). **Verified** in the docs. Raise it first (§8).

### 2.3 Status line JSON – **verified in the docs**, the best live source for local sessions

A status line script gets this on stdin after each update:

- `cost.total_cost_usd`: "estimated session cost in USD, computed client-side at list price". It resets on `/clear`.
- `session_id`, **`session_name`** (the `/rename` name or the AI title, so `#N …`), `transcript_path`, the workspace.
- **`rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage`** and their `resets_at`. Only for
  Pro / Max / Ultra subscribers, and only after the session's first response.

So one small script gets everything a row needs in one place: issue (from the title), session, estimated cost, and
whether the weekly limit was already used up (≥ 100 % → this session's work was billed as extra usage).
**Open:** does the desktop app run a status line script? It is a terminal feature, so this needs checking in the
desktop app. If it doesn't run one, the hook in §2.5 does the same job from the transcript.

### 2.4 `/usage` (formerly `/cost`) – **verified in the docs**, manual only

- Session block: tokens and a dollar figure at list price, per model. For subscribers the docs say the cost figure
  "isn't relevant for billing purposes". It is the same estimate as above.
- Plan bars, plus an *attribution* of the last 24 h / 7 d to skills, subagents, plugins and MCP servers. Computed
  "from local session history on this machine", so cloud sessions and claude.ai don't count.
- **Usage-credits row:** extra usage spent this month and the monthly limit (Pro / Max / Ultra). This is the only
  place inside Claude Code that shows **real** EUR spend, and it is a monthly total, not per session.
- It is something you read by eye. You can't script it. It is useful for the monthly check (§5), not for the ledger.

### 2.5 Hooks – **verified (partly)**

- Every hook gets `session_id`, `transcript_path`, `cwd`, `permission_mode`, `effort`, `hook_event_name`. No hook
  input has cost or tokens. **Verified** (the visible part of the hooks reference).
- `SessionEnd` (reasons `clear`, `resume`, `logout`, `prompt_input_exit`, `other`) and `Stop` (after every turn) can
  run the transcript costing from §2.2 and write a row. `SessionStart` can *set* a title (`sessionTitle`) but not
  read one.
- Hooks in `~/.claude/settings.json` apply to every project on the machine. Hooks in a repo's `.claude/settings.json`
  also run in cloud sessions of that repo. **Guess** for cloud sessions; it follows from cloud sessions using the
  repo's settings.

### 2.6 OpenTelemetry – **verified in the docs**, the most complete source, but heavy

- With `CLAUDE_CODE_ENABLE_TELEMETRY=1`, Claude Code exports `claude_code.cost.usage` (USD) and `claude_code.token.usage`
  (`type`: input / output / cacheRead / cacheCreation). The attributes are `model`, `query_source` (main / subagent /
  auxiliary), `speed`, `effort`, `agent.name`, `skill.name`, `mcp_server.name`. There is an event per request,
  `claude_code.api_request`, with `cost_usd` ("estimated"), the token counts and `request_id`.
- On every data point: `session.id`; **`ccr.session.id` in cloud sessions**; `user.account_uuid`; and with
  `OTEL_METRICS_INCLUDE_REPOSITORY=true`, `vcs.repository.name`. `OTEL_RESOURCE_ATTRIBUTES="project=osct,issue=242"`
  adds your own keys.
- **What it doesn't solve:** the issue number. It changes per session, while the env var is set before
  `claude` starts. In the desktop app that means once per app, not per session. It also needs a collector
  running somewhere (OTLP or Prometheus), and for cloud sessions one they can reach.
- Verdict: for later, if the number of services and machines grows (§6). The `result` events plus transcripts give
  the same numbers without running anything.

### 2.7 claude.ai usage page, APIs – **partly verified**

- claude.ai → Settings → Usage: plan bars, the usage-credits balance, this month's extra-usage spend and the limit.
  **Verified** (in the Claude Code docs, `/usage-credits` opens it). A breakdown per session or per project is
  **not documented**. **Guess:** there isn't one.
- APIs: the Enterprise Analytics API and the Console's Claude Code Analytics API exist, but only for Enterprise or
  API (Console) accounts. **Verified** in the docs. There is **no documented API** for an individual Ultra
  subscription's usage. **Guess,** based on the docs listing none.
- **Cloud session credits** (the included $250, expiring **2026-11-05**): **Open:** how a session's cost is drawn
  from it. Probably at list price, the same `total_cost_usd`, but that is a guess. Tilman saw extra usage go from
  EUR 41 to 87 while the credit barely moved. That fits the extra usage coming from parallel *local* sessions past the
  weekly limit. It doesn't prove where the cloud sessions were billed. **Test it once:** note the credit balance and
  the extra-usage figure, run one cloud session, compare both against its `total_cost_usd`. Note too: the credit runs
  out in five days. After that, cloud sessions draw the plan, the same as local ones.

### 2.8 Other services – **verified for one**

- **Flora** (MCP): its server instructions say `run_cost` / `charged_cost` are in USD, and there is a `flora_get_usage`
  tool. Each generation returns what it **charged**, so this is a real charge, not an estimate.
- GitHub Actions minutes, CDN traffic, other model APIs (OpenAI and so on): each has a usage page or API, which would
  be read monthly or per run. Not checked yet. **Guess.**

---

## 3. The record

### 3.1 The ledger: `agents/costs.csv`, one per repo, append-only

One row per **session** (or per run or charge, for other services). This is the single source everything else is
computed from.

```
date,project,issue,role,service,session,title,model,unit,quantity,est_usd,paid_from,billed,currency,source
2026-10-29,osct,28,worker,claude-cloud,session_01AabNG9LQhaNiESL1TuMzMP,"#28+#29 Typed boundaries…",claude-opus-5-5,tokens,38500884,12.16,cloud-credit,,,"result-event"
2026-10-31,osct,242,worker,claude-cloud,session_01AabNG8dMQq5pG2cR11qY1R,"#242 Cost per issue…",claude-opus-5-5,tokens,…,…,cloud-credit,,,"transcript"
2026-10-31,osct,<N>,orchestrator,claude-local,<session-id>,"#<N> Night shift 31.10",claude-opus-5-5,tokens,…,…,extra,,,"transcript"
2026-10-31,osct,204,worker,flora,run_…,"#204 glow light textures",flux-…,generations,4,0.04,flora,0.04,USD,"flora run_cost"
2026-10,osct,,bill,claude-extra,,"Extra usage October",,,,,,46.00,EUR,"claude.ai Settings → Usage"
```

- `issue` comes from the title's first `#N`; a title with several (`#28+#29`) is split evenly, or by the
  orchestrator's judgement. Empty when the title has none: that is the "untracked" bucket and shows up as such.
- `role`: `worker` · `orchestrator` · `subagent` (only if it ever has to be split out) · `bill` (a real charge from an
  invoice).
- `service`: `claude-local`, `claude-cloud`, `flora`, `gh-actions`, … New services add a value, not a column.
- `est_usd` is **always an estimate** (list price, or the service's own figure). `billed` + `currency` are **only ever
  real charges**: an invoice, the usage page, a service's `charged_cost`. The two are never added together.
- `paid_from`: `plan` · `extra` · `cloud-credit` · `cloud-plan` · `<service>` (§4).
- `source` names where the number came from, so anyone can check it.

**Why in the repo:** the budget belongs to the project (Tilman), and the ledger sits next to it. It is
reviewable, history comes free, and it is the same in every project. It is written by **one writer per repo, the
orchestrator, on `develop`** (§3.4), so it never conflicts in merges. Changes in `agents/` need no version bump
(RULES #23).

### 3.2 The budget: `agents/COSTS.md` per repo

- On top: the budget, e.g. *"osct: USD 300 / month list estimate, of that EUR 50 extra usage at most; cloud credit
  first."* Also a per-issue guide if wanted (e.g. *"a design issue ≈ $5, a feature ≈ $15–25"*).
- Below: a table generated from `costs.csv`, per month (estimated, billed, budget, what is left) and the most
  expensive issues. Regenerated by the same script, never edited by hand.

### 3.3 On the issue and on the board

- **Issue:** the orchestrator's closing comment on `develop` (it is needed anyway, see ORCHESTRATION.md) gets one line:
  `Cost: ≈ $14.80 list (2 sessions: worker $12.16 cloud credit, orchestrator share $2.64 plan) – estimate.`
- **Board:** a number field *"Cost (USD, est.)"* on the project board, set by the orchestrator. The board then
  sums by lane or label. Every project gets the same field.

### 3.4 Who writes it

| what | who | when | how |
| --- | --- | --- | --- |
| cloud worker sessions | **orchestrator** | at merge | `list_events(kinds: ["result"])` on the worker's session → sum of `model_usage_since_last_result`; title → issue |
| local worker sessions (worktrees) | **orchestrator** | at merge | the transcript script (§2.2) on the worker's `session-id` (the orchestrator runs on the same machine) |
| the orchestrator itself | **orchestrator** | at the end of the shift (and once a day in long shifts) | its own earlier `result` events (cloud) or its own transcript (local); booked to its shift issue |
| sessions no orchestrator sees (ad hoc, chats about code) | **`SessionEnd` hook** (user level, all projects) | when the session ends | transcript script → a row in a workspace inbox (§6), taken into the repo ledger by the next orchestrator run |
| the worker itself | **worker** | in its final report | "Cost so far: ≈ $x" from its own transcript. Only a hint (the last turn is missing). The orchestrator's figure counts |
| monthly bills | **Tilman** (or a reminder session) | on the 1st | extra-usage EUR and cloud credit used, read from claude.ai → one `bill` row per month; Flora and others likewise |

**Orchestrator sessions** (Tilman's addition): every orchestrator shift starts with its own issue, as RULES #30 already
asks of every session, e.g. `#N Night shift 31.10`. Its cost is booked to **that issue** as `role: orchestrator`.
That keeps it visible as overhead. The report can additionally *show* each worker issue's share of the orchestrator
(split by the workers' `est_usd`), but the row itself stays with the shift issue, so nothing is counted twice.

---

## 4. From plan usage to an estimate, kept apart from real charges

What pays for a session, and what the ledger can know about it:

| `paid_from` | what it is | per session | real money |
| --- | --- | --- | --- |
| `plan` | local session within the weekly limit (Ultra) | `est_usd` (list) | none extra: the flat subscription |
| `extra` | local session after the weekly limit | `est_usd` (list) | monthly EUR from claude.ai, spread over these rows |
| `cloud-credit` | cloud session while the $250 credit lasts | `est_usd` (list) | **open** whether the credit is drawn at list (§2.7); monthly from the balance |
| `cloud-plan` | cloud session after the credit (from 2026-11-05) | `est_usd` (list) | like `plan` / `extra` |
| `flora`, … | another service | the service's own figure | usually charged directly → `billed` |

- **How a row gets its `paid_from`:** the status line's `rate_limits.seven_day.used_percentage` (§2.3) says whether the
  weekly limit was reached. If there is no status line, the time of the session is compared with the time the limit
  was hit, which the orchestrator notes when Claude Code reports it ("You've hit your weekly limit"). Cloud sessions
  before 2026-11-05 are `cloud-credit`.
- **Real charges are never computed per session.** Once a month the `bill` rows (EUR extra usage, USD credit used)
  are spread over the month's `extra` / `cloud-credit` rows in proportion to `est_usd`. That gives an *allocated*
  figure per issue, which the report shows in its own column. The subscription fee can be shown the same way
  (fee ÷ the month's `plan` list USD = an effective rate), clearly marked as a way of looking at it, not as a cost.
- So every issue shows two numbers: **≈ list USD** (always, comparable across months and services) and **allocated
  real money** (once the month's bills are in).
- Currencies stay as charged (EUR, USD). Converting them is the report's job, at the month's rate, in its own column.

---

## 5. Monthly check (5 minutes)

On the 1st: claude.ai → Settings → Usage (extra usage EUR, cloud credit balance), Flora's usage, any other service.
One `bill` row each. The report then compares estimated against billed. A large gap means something is not being
collected (most likely sessions with no `#N` in the title, or helper calls). The check also answers the open
question of how cloud credits are drawn (§2.7).

---

## 6. For every project in `C:\Development\`

- **Tooling once, at workspace level:** `C:\Development\tools\costs\`, next to `C:\Development\ORCHESTRATION.md`. In
  it: the transcript costing, the `result` reader (through the claude-code-remote MCP, or the orchestrator calling it
  directly), the price table, the service adapters (Flora, …) and the report. One script for all projects.
- **Project from the path:** the transcript folder (`C--Development-scutoons-…`) or the cloud session's repository
  gives the project. Issue numbers belong to each project's own repo (`osct#242` ≠ `scutoons#242`), so `project` +
  `issue` together are the key.
- **Inbox for the hook:** the `SessionEnd` hook (in `~/.claude/settings.json`, so in every project) appends to
  `C:\Development\.costs\inbox.csv`, outside git. Each project's orchestrator moves its own rows into its repo's
  `agents/costs.csv` (or the project's equivalent) at its next run. Cloud sessions need no inbox, because their
  `result` events can be read at any time.
- **Same files in every repo:** `agents/costs.csv` + `agents/COSTS.md` (the budget), and the same board field. Projects
  without `agents/` use `docs/` or the root. The rule goes into the workspace `ORCHESTRATION.md`, not into each
  project.
- **A workspace overview** (all projects, all services, per month) is a report across the repos' CSVs. Nothing is
  stored twice.
- **Later, when there are more machines and services:** OTel (§2.6) into one collector, with
  `OTEL_RESOURCE_ATTRIBUTES=project=…` per project (set in each repo's `.claude/settings.json` `env`) and the issue
  from `ccr.session.id` / `session.id` → title. Only worth it once the scripts stop being enough.

---

## 7. What to decide

1. **Ledger in the repo** (`agents/costs.csv`, written by the orchestrator only), or only on the issues and the board?
   *Recommended: in the repo, with the budget beside it.*
2. **Per-issue line in the closing comment and the board field:** both, or one of them?
3. **Orchestrator overhead:** only on the shift issue (recommended), or also spread over the workers' issues in the
   ledger itself?
4. **Budget per project:** a monthly figure (in list USD? in EUR real money?) and what happens when it is reached
   (a note to Tilman, or the orchestrator stops starting new workers).
5. **The cloud credit expires on 2026-11-05.** Run the one reconciliation test (§2.7) before then?

---

## 8. The smallest first step (tomorrow, no code)

1. **Keep the raw data:** in `C:\Users\<you>\.claude\settings.json` add `"cleanupPeriodDays": 365`. Local transcripts
   then stay for a year instead of 30 days, and every later report can be run backwards over them.
2. **One step in the orchestrator's merge routine** (workspace `ORCHESTRATION.md`, worker brief unchanged):
   *"Before closing a worker's issue, read its cost: `list_events(<worker session>, kinds: ["result"])` → add up
   `model_usage_since_last_result[*].costUSD` (for a one-turn session that is `total_cost_usd`). Write
   `Cost: ≈ $x list (estimate), paid from: cloud credit` into the closing comment."* That is a number for every cloud
   worker from the next shift on. Since past `result` events are still there, the same step can be run once over all
   finished cloud sessions to cost the work done so far.

After that, in this order: the transcript script and the ledger (local sessions, orchestrators), then the `SessionEnd`
hook and the inbox, then the budget file and the board field, then other services' adapters.

---

*This session (#242, a cloud session) as far as it can see itself, from its transcript just before the final commit:
18 responses, about 2.0 M cache-read and 106 k cache-write tokens, 23 k output → **≈ $1.44 at list price**. This is an
estimate: the last turn and the WebFetch helper calls are not included. Paid from: cloud credit, presumably. Its
`result` event will hold the exact figure once this turn ends.*
