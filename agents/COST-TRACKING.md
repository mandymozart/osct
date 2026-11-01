# Cost per issue – a proposal (#242)

Tilman, 2026-10-31: *"Messen wie viel Cloud- und Usage-Credits bei diesen Aufgaben verbraucht werden … wie ich pro
Issue am besten für jedes Projekt den Preis tracken kann."* Also: *"zusätzlich sollten orchestrator sessions auch
getrackt werden. projekt budget sollte ggf. teil des repos werden"* and *"ich werde mehrere services in zukunft parallel
benutzen und die sollen alle kosten tracken."* And on 2026-11-01: *"wir halten auch kosten für abos fest. dazu in develop
auch ein ordner agents/costs.json – dieser kann und sollte auch mit einem online shareable punkt verknüpft sein. ggf.
ein privates repo, wo wir alle services tracken. auch jeden anderen provider für video etc."* And: *"Wichtig: Kosten
sollen nur getrackt werden, wenn sie tatsächlich anfallen und nicht Teil des Abos sind."* Then: *"can we use a sqlite
db instead of the json? and actually just create a super simple tool with maria db on agents.porschuetz.de?"* (§3).

**Status: proposal only. Nothing has been built.** Tilman decides; then it becomes issues.

Each lead below is marked **verified** (checked in the docs or in a real session today), **guess** (likely, not checked)
or **open** (has to be measured before anyone relies on it).

---

## 1. Summary

**The rule (Tilman, 2026-11-01): a cost is recorded only when money is actually charged. Usage that the subscription
already covers is not a cost.**

| recorded | not recorded |
| --- | --- |
| **extra usage**: Claude work past the plan's limits, billed in EUR | local and cloud sessions **within the plan** (Ultra) |
| **pay-per-use charges** of any provider (per run, per minute, per GB) | runs inside a provider's included quota |
| **purchases**: credit packs, top-ups | the runs that draw a pack already bought |
| **subscription fees**, once per period, as fixed costs | the included cloud session credit ($250, a promotion) and anything drawn from it |

- **Per issue, only extra usage and pay-per-use show up.** Most issues therefore cost nothing extra and get no entry.
  An issue gets one when its work ran while extra usage was on, or caused a provider charge.
- **Whether a session ran on extra usage is measurable, in cloud sessions verified.** Each cloud session's
  `rate_limit_event` has `isUsingOverage`, and its `rateLimitType` names what paid for it. The #28+#29 worker shows
  `ccr_promotional`, the cloud credit, resetting on 2026-11-05, with `isUsingOverage: false`. Locally, the status line's
  `rate_limits.seven_day.used_percentage` reaching 100 marks the same thing (§2.3).
- **How much it cost per session is measurable too.** Cloud sessions: the `result` event's `total_cost_usd`. Local
  sessions: the transcripts' token counts × list price, which reproduces Claude Code's own figure to the cent. That
  figure is used **only** to split the month's real extra-usage bill over the issues that caused it, never as a cost
  of its own (§4).
- **The record: one database, a small tool on `agents.porschuetz.de`** (§3). It runs on MariaDB on the server and
  SQLite locally and in tests, the same stack as osct's API. It lives in its own private repo (proposed
  `mandymozart/agents`). It holds projects, services, subscriptions, sessions, the extra-usage parts, bills and the
  cost ledger (`charges`) for every project. It has one page with a read-only share link, and an API with a token per
  writer. No money sits in any project repo, which matters because osct is public. It can later grow into a web-based
  orchestration tool (§3.10).
- **Who writes it:** the orchestrator at merge, a local hook for sessions no orchestrator sees, and Tilman or a monthly
  session for bills and subscriptions.
- **Orchestrator sessions** are judged by the same rule. If one ran on extra usage, its share is booked to its own shift
  issue, never hidden inside the workers' numbers.
- **Any service:** a provider is a row in `services`, not a code change. Apps such as the scutoons storyboard read the
  report and post their run log through the API, to reconcile their runs against the provider's charges (§3.7).
- **Tomorrow:** set `cleanupPeriodDays` to 365. Have the orchestrator check `isUsingOverage` at merge and note any
  extra usage in the closing comment. Tilman sets up the repo, the subdomain and the database, then the first version
  of the tool gets built (§8).

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
- **Running total, verified on this session (#242):** turn 1 `total_cost_usd` 1.6404. Turn 2, a day later in a fresh
  container, `total_cost_usd` 3.6507 with `model_usage_since_last_result` 2.0103 = 3.6507 − 1.6404. So
  `total_cost_usd` and `modelUsage` are **running totals for the session**, and `model_usage_since_last_result` is
  **that turn's** share. The session's cost is the last `total_cost_usd`. One turn's cost, which is what the
  extra-usage split needs (§4), is its `model_usage_since_last_result`.
- **Guess:** `total_cost_usd` includes the session's subagents (Agent tool, workflows). `subagent_stats` sits on the
  same event. Check it on a session that spawned some.
- **Open:** a session's own *current* turn has no `result` yet. A session can only report its earlier turns this way
  (see §2.3 for the rest).

### 2.1a Cloud session `rate_limit_event` – **verified**: who paid

The same `list_events`, with `kinds: ["rate_limit_event"]`, gives `rate_limit_info` (checked on the #28+#29 worker,
2026-10-29):

| field | value | meaning |
| --- | --- | --- |
| `rateLimitType` | `ccr_promotional` | drawn from the cloud session credit |
| `resetsAt` | 1793865600 = **2026-11-05 08:00 UTC** | the credit's expiry |
| `isUsingOverage` | `false` | **not** billed as extra usage |
| `overageStatus`, `overageDisabledReason` | `rejected`, `org_level_disabled_until` | extra usage was not allowed for it at the time |
| `unifiedWindows.five_hour` / `.seven_day` | utilization 0.05 / 0.61, with `resetsAt` | the plan's own windows (61 % of the week used) |

That is the signal the rule needs: **`isUsingOverage: true` is the moment a cloud session starts costing money.** A
session that crosses the line mid-way has several events, one per change. **Open:** what `rateLimitType` reads once
the credit has expired and a session draws the plan (probably the plan's window type). Check it on the first cloud
session after 2026-11-05.

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
- **Gap (verified on this session):** helper calls on a small model (WebFetch's summaries and the like) don't show
  up as `assistant` lines. The `result` event does count them: this session's first turn lists `claude-haiku-5-5`
  at $0.011 beside Opus at $1.629. OTel counts them too (`query_source: auxiliary`). They are small.
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

## 3. The record: one database, a small tool on `agents.porschuetz.de`

Tilman, 2026-11-01: *"can we use a sqlite db instead of the json? and actually just create a super simple tool with
maria db on agents.porschuetz.de? this could track my entire costs across these projects. later we can turn this into
a web based orchestration tool like amp."*

This **replaces** the earlier files (`agents/costs.json` per repo, a `costs` data repo with JSON files).

### 3.1 Why a database, and why not a SQLite file in git

- **A database instead of JSON:** many writers (orchestrators of several projects, cloud sessions, hooks, the
  storyboard), queries across projects, months and services, and a monthly split. JSON files in repos would mean merge
  conflicts, a parser in every tool, and money figures sitting in a **public** repo (osct).
- **Not a SQLite file in git:** a binary file can't be merged, and two orchestrators writing it at once is a conflict
  every time. Cloud sessions couldn't write to it on Tilman's machine either.
- **So: MariaDB on the server, SQLite locally and in tests.** That is osct's own pattern: `server/api/src/Db.php`
  writes queries that run on both, the CI tests both (SQLite and MariaDB, #168), and SQLite is the fallback without a
  database. The tool uses the same stack: PHP 8.3, MariaDB, SQLite for development.
- **No money in any project repo.** Each repo only names its project key in its orchestration notes. The public-repo
  question (§3.6 before) goes away.

### 3.2 Where it runs

- **`agents.porschuetz.de`**, its own small app in its **own private repo**. Proposed name `mandymozart/agents`, which
  also fits the orchestration tool it is meant to grow into (§3.10).
- **Hosting, two ways:**
  - **Now:** the all-inkl shared host that serves osct.porschuetz.de today: PHP plus a MySQL/MariaDB database,
    deployed over FTPS like `deploy-staging-ftps.yml`. **Guess:** all-inkl gives the subdomain its own database.
    Tilman knows.
  - **Later:** Kamal on the VM, like osct (docs/deploy.md), with MariaDB as an accessory.
- **I can't do either from here:** there are no credentials, no DNS, no repo in this session. The repo, the subdomain,
  the database and the deploy secrets are Tilman's (or a session he gives them to).

### 3.3 Tables (MariaDB, SQLite-compatible)

| table | holds | notes |
| --- | --- | --- |
| `projects` | key (`osct`, `scutoons`, `nadeos`, …), repo, public or private, monthly budget (EUR) | |
| `services` | Claude, Flora, video providers, hosting, CDN, GitHub, …: kind (subscription / usage / both), currency, billing page | a new provider is a row, not a code change |
| `subscriptions` | service, plan, fee (cents), currency, period, since, renews, cancel-by, ended | the fixed costs |
| `subscription_splits` | subscription × project → share | optional, for fees per project |
| `sessions` | Claude session id (cloud `session_…` or local id), cloud/local, role (worker / orchestrator), project, title, issue numbers, start and end, branch | **activity, not cost**: needed for the split and later for orchestration |
| `extra_usage` | session, turn or time span, list-price weight | only the parts that ran on extra usage (§4) |
| `extra_windows` | from, until, source (status line, limit notice) | when the account was on extra usage, for local sessions |
| `charges` | the **cost ledger**: service, project, issue, kind (`extra-usage` · `pay-per-use` · `purchase` · `subscription-fee`), date, amount (cents) + currency, reference (run id, invoice no.), source | **only real money** (§1) |
| `bills` | service, month, total, currency, reference | the monthly real totals. The split turns them into `charges` per issue |
| `runs` | app (storyboard, …), service, run id, project, issue, reported cost, time | an app's own log, **for reconciling only** |
| `tokens` | name, scope (`write:project` / `read`), project, hash | one per writer (each project's orchestrator, the hook, the storyboard) |

- Amounts in cents (integers) with an explicit currency. Converting currencies is done at the month's rate, in the
  report only.
- Additive migrations at start, as in osct (`server/deploy/migrate.php`).

### 3.4 Subscriptions

They are **rows in `subscriptions`**: Claude Ultra, Flora, video providers, hosting, domains, CDN, GitHub. The fee is
charged once per period as a `subscription-fee` charge, optionally split over projects. It is **never** spread over
issues: work within the plan costs nothing extra. **Credit packs:** buying the pack is a `purchase`. The runs drawing
it are not costs (`runs` keeps them for reconciling). The monthly check lists what renews or must be cancelled next
month. The amounts are Tilman's to enter; nothing is guessed.

### 3.5 API and page

- **API** (JSON, `Authorization: Bearer <token>`):
  - `POST /api/sessions` (orchestrator, hook): records the session, its issues and its extra-usage parts.
  - `POST /api/charges` (provider charge, purchase).
  - `POST /api/bills` (the month's totals → the split).
  - `POST /api/runs` (the storyboard, other apps).
  - `GET /api/report?month=&project=`, `GET /api/issues/<project>/<n>`, `GET /api/health`.
- **One page:** month × project × service, the costliest issues, unassigned extra usage, budgets and what is left,
  renewals. Plus forms for subscriptions and bills.
- **Sign-in:** a single user to start with. Either the email code sign-in osct already has (`Auth`, `LoginMail`) or,
  simplest, HTTP Basic over TLS. A **read-only share link** (a signed, revocable token per view) makes it shareable
  without an account.
- **MCP, later:** the same API as MCP tools (`record_charge`, `cost_report`), the way osct's `mcp/` wraps its API. Then
  any session can ask "what did #242 cost?".

### 3.6 Writers need network access and a token

- **Local sessions** (the orchestrator, the `SessionEnd` hook): `curl` to the API with a token from an environment
  variable. Nothing else is needed.
- **Cloud sessions:** the cloud environment's network policy has to allow `agents.porschuetz.de`, and the token has to
  be an environment secret. Both are settings Tilman makes in the environment. **Guess:** not allowed by default.
  Until then, the local orchestrator records its cloud workers. It reads their `result` and `rate_limit_event` events
  with `list_events` (§2.1, §2.1a), which works from anywhere.

### 3.7 The scutoons storyboard

Tilman, 2026-11-01: *"scutoons storyboard wird darauf auch zugreifen müssen, um Kosten zumindest abzugleichen."*

- It gets a token of its own: `read` for the report and the providers' charges, `write:runs` for its run log.
- **Reconciling:** its runs (provider, run id, reported cost, shot or scene, issue) against the provider's charges and
  bills by run id and month. The page shows what matches, what the provider charged that the storyboard doesn't know,
  and the other way round. Runs inside a quota or drawn from a pack are not costs. That is what the check is for.
- The token stays on the storyboard's server side, never in a browser bundle.
- **Guess:** what the storyboard logs. scutoons is not in this session's scope. Its orchestrator checks.

### 3.8 On the issue and on the board

Optional, and only when an issue had a real cost. The orchestrator's closing comment on `develop` gets one line with a
link to `agents.porschuetz.de/issues/<project>/<n>`, without an amount in a public repo. The board can get a number
field "Cost (EUR)" from the API.

### 3.9 Who writes it

| what | who | when | how |
| --- | --- | --- | --- |
| cloud worker sessions | **orchestrator** | at merge | `list_events` → `isUsingOverage`? If not → `POST /api/sessions` without extra parts (activity only), or nothing. If so → with the extra parts and their weight from the `result` events |
| local worker sessions | **orchestrator** | at merge | extra-usage window during the session? → transcript script for that part → `POST /api/sessions` |
| the orchestrator itself | **orchestrator** | at the end of the shift | the same, booked to its shift issue (`role: orchestrator`) |
| sessions no orchestrator sees | **`SessionEnd` hook** (user level, all projects) | when the session ends | the same check → `POST /api/sessions` |
| provider charges | whoever started the run, or the provider adapter | when charged | `POST /api/charges` |
| subscriptions, bills | **Tilman** (page forms) or a monthly session | when they change, and on the 1st | the page or `POST /api/bills` → the split |
| app run logs | **the app** | per run | `POST /api/runs` |

**Orchestrator sessions** are judged by the same rule: if one ran on extra usage, that part goes to its own shift issue
(RULES #30: every session starts with its issue, e.g. `#N Night shift 31.10`). That keeps it visible as overhead, and
nothing is counted twice.

### 3.10 Later: a web-based orchestration tool

The database already knows projects, issues, sessions, roles and costs. The next steps toward an orchestration page:
1. A live list of sessions per project and issue: state, branch, cost so far, extra usage yes or no. The data comes
   from `list_sessions` / `get_session`, recorded by the orchestrator. **Guess:** whether a web server can read the
   sessions directly is not documented. The sessions API that the container's `CLAUDE_CODE_REMOTE_SDK_URL` points to
   (`api.anthropic.com/v1/code/sessions/…`) is internal as far as I can tell.
2. Budgets that act: the orchestrator asks the API before it starts a worker ("osct is at 90 % of its extra-usage
   budget").
3. Starting and steering workers from the page, through a session that holds the claude-code-remote tools.

Each step is its own issue in `mandymozart/agents`. None of this is needed for cost tracking.

---

## 4. What counts, and how extra usage is split over issues

| what paid | recorded? | per issue |
| --- | --- | --- |
| the plan (Ultra), local or cloud, within the limits | **no** | nothing |
| the cloud session credit (`ccr_promotional`, until 2026-11-05) | **no**: a promotion, no money | nothing |
| extra usage (`isUsingOverage`, or weekly limit used up) | **yes**, the monthly bill in EUR | a share of that bill |
| a provider's pay-per-use charge | **yes**, as charged | the charge, on the issue that caused it |
| a credit pack, a top-up | **yes**, the purchase | nothing (the runs are not costs) |
| a subscription fee | **yes**, once per period | nothing (optionally split over projects) |

**Finding the extra-usage part of a session:**
- **Cloud:** `isUsingOverage` in the session's `rate_limit_event`s (§2.1a, verified). From the first event with `true`,
  the turns are extra usage. Their cost comes from the `result` events of those turns (`model_usage_since_last_result`).
- **Local:** the moment the weekly (or five-hour) limit was used up and extra usage took over. The status line's
  `rate_limits.*.used_percentage` reaching 100 marks it (§2.3, verified in the docs), and so does Claude Code's notice
  when the limit is hit. A small log of these **extra-usage windows** (from, until the `resets_at`) covers every
  session of the account, local and cloud, because they share the plan. The transcript's responses inside a window
  are the extra part (each line has a timestamp). **Open:** whether local transcripts record the same
  `rate_limit_info` as the cloud events. If they do, no window log is needed.

**From list price to real money:**
- The session's extra part, at list price, is only a **weight** (`list_usd`). **Open:** whether extra usage is billed
  at API list price. The monthly bill settles it either way.
- At the end of the month: each issue's share of the month's extra-usage weight × the bill's EUR (claude.ai →
  Settings → Usage, extra usage) = one `charges` row per issue. The shares add up to 100 %, so the per-issue amounts
  add up to the real bill.
- Anything in the bill that no entry explains (a session without `#N`, a chat on claude.ai, idle check-ins) stays
  visible as **unassigned**, not spread over the issues.

## 5. Monthly check (5 minutes)

On the 1st, enter in the page's forms:
- the extra-usage EUR from claude.ai → Settings → Usage,
- the provider bills and purchases,
- the subscription fees actually charged.

The tool then:
- splits the extra usage over the issues,
- shows what stays unassigned,
- reconciles the apps' runs against the providers' charges,
- lists next month's renewals and cancellation dates.

A month without extra usage has no Claude charges, only the fixed fees.

---

## 6. For every project in `C:\Development\`

- **One tool, one database** for every project and service. A project is a row. Issue numbers belong to each project's
  repo (`osct#242` ≠ `scutoons#242`), so `project` + `issue` is the key.
- **The project from the path:** the transcript folder (`C--Development-scutoons-…`) or a cloud session's repository
  names the project.
- **The scripts** (overage check, extra-usage windows, transcript costing, `result` reader, price table, provider
  adapters) live in the tool's repo. The workspace `ORCHESTRATION.md` says how an orchestrator calls them, once for
  all projects.
- **The `SessionEnd` hook** in `~/.claude/settings.json` applies to every project on the machine. It posts to the API
  directly, so no inbox file is needed.
- **Later, with more machines and services:** OTel (§2.6) could feed the same database through a small collector
  endpoint. Only worth it once the scripts stop being enough.

---

## 7. What to decide

1. **The rule** (§1, §4): only extra usage, pay-per-use charges, purchases and subscription fees. Nothing within the
   plan, nothing on the included cloud credit. Subscription fees per project by fixed shares, or only as a total?
2. **The tool:** its own private repo `mandymozart/agents` (name OK?) on `agents.porschuetz.de`.
3. **Hosting now:** the all-inkl shared host over FTPS (PHP plus a database, quickest), or wait for the Kamal VM?
4. **Sign-in:** osct's email code or HTTP Basic, plus read-only share links?
5. **Sessions without extra usage:** record them as activity (needed for the orchestration page later; not costs), or
   only sessions with extra usage?
6. **Budget per project:** a monthly EUR cap. When it is reached: a note to Tilman, or the orchestrator starts no new
   workers while extra usage is on?
7. **Cloud sessions writing directly:** allow `agents.porschuetz.de` in the cloud environment's network policy, with
   the token as a secret? Or leave it to the local orchestrator?
8. **The scutoons storyboard:** its own token, read plus `write:runs` (§3.7)?

---

## 8. The smallest first steps

**Tomorrow, no code:**
1. `"cleanupPeriodDays": 365` in `C:\Users\<you>\.claude\settings.json`, so local sessions can still be costed later.
2. **One step in the orchestrator's merge routine** (workspace `ORCHESTRATION.md`):
   > *Before closing a worker's issue: `list_events(<worker session>, kinds: ["rate_limit_event"])`. If no event has
   > `isUsingOverage: true`, there is nothing to record. If one does, note `extra usage, list weight $x` (x from the
   > `result` events from that point on) and tell Tilman.*

   Until the tool exists, the notes go into the closing comment, and the tool imports them later.

**Tilman sets up (the session can't):**
- the private repo `mandymozart/agents`,
- the subdomain `agents.porschuetz.de` with a MariaDB database,
- the deploy secrets.

**Then the first version, small enough for one session:**
- PHP 8.3, with `Db` following osct's pattern (MariaDB and SQLite).
- The tables from §3.3 and the five API routes from §3.5.
- One page, sign-in and the forms for subscriptions and bills.
- An FTPS deploy like `deploy-staging-ftps.yml`.
- Tests on SQLite and MariaDB.

**After that:** the overage check and transcript script posting to the API, the `SessionEnd` hook, the monthly split,
then the provider adapters, the storyboard's token and the MCP tools.

**Also worth checking:** whether extra usage should be allowed for cloud sessions at all. On 2026-10-29 it wasn't
(`overageDisabledReason: org_level_disabled_until`). So the EUR 41 → 87 came from local sessions past the weekly
limit. That is a guess from one event.

---

*This session (#242, a cloud session) as far as it can see itself, at list price (all of it drawn from the cloud
credit, presumably, so under the rule in §1 **not a cost**):
- **Turn 1** (2026-10-31, the proposal): **$1.640**, from its `result` event (Opus $1.629 + Haiku helper calls
  $0.011).
- **Turn 2** (2026-11-01, subscriptions, central repo, storyboard): **$2.010**, from its `result` event. That makes
  **$3.651** in total.
- **Turns 3 and 4** (2026-11-01, "only real costs", then the database and tool): about **$1.7** from the transcript,
  so about **$5.3** in total.*
