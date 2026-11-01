# Cost per issue – a proposal (#242)

Tilman, 2026-10-31: *"Messen wie viel Cloud- und Usage-Credits bei diesen Aufgaben verbraucht werden … wie ich pro
Issue am besten für jedes Projekt den Preis tracken kann."* Also: *"zusätzlich sollten orchestrator sessions auch
getrackt werden. projekt budget sollte ggf. teil des repos werden"* and *"ich werde mehrere services in zukunft parallel
benutzen und die sollen alle kosten tracken."* And on 2026-11-01: *"wir halten auch kosten für abos fest. dazu in develop
auch ein ordner agents/costs.json – dieser kann und sollte auch mit einem online shareable punkt verknüpft sein. ggf.
ein privates repo, wo wir alle services tracken. auch jeden anderen provider für video etc."*

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
- **The record, in two places:**
  - Every project has **`agents/costs.json` on `develop`**: the project's key, its budget, its sessions per issue, and
    a link to the shared overview.
  - A **private central repo** (proposed name `mandymozart/costs`) holds what spans projects or is private: all
    **subscriptions** (Claude Ultra, Flora, video providers, hosting, CDN, …), the monthly bills, every provider's
    charges, the tooling and the overview. Being a private repo, it is the **online, shareable place**: invite someone
    to it, or publish a private, link-shareable dashboard from it (§3.5).
  - The issue gets a cost line in its closing comment, and the board gets a number field.
- **osct is a public repo.** Anything in its `agents/costs.json` is public. Proposal: public repos keep only list-price
  *estimates* per issue there (or only the link). Subscriptions, bills, budgets in EUR and real charges live only in
  the private repo (§3.6, decision §7).
- **Who writes it:** the orchestrator writes at merge. A local hook catches sessions that no orchestrator sees.
- **Orchestrator sessions get their own rows**, booked to their own issue (a "shift" issue), never hidden inside the
  workers' numbers.
- **Not only Claude, and not only usage:** every entry has the same service-neutral fields (`service`, `kind`, `unit`,
  `quantity`, `est_usd`, `billed`). That covers Flora, video and other providers, other AI APIs and GitHub Actions
  minutes, each through a small adapter. Subscriptions are their own kind, a fixed amount per period, split over
  projects by share (§3.4). Apps such as the scutoons storyboard read the central repo to reconcile their own
  run costs (§3.7).
- **Tomorrow:** set `cleanupPeriodDays` to 365 (keeps the raw data), start the private repo with a `subscriptions.json`,
  and add one step to the orchestrator's merge
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

## 3. The record

### 3.1 Two places, one rule

| | `agents/costs.json` in every project repo, on `develop` | private central repo `mandymozart/costs` |
| --- | --- | --- |
| what | the project's key, a link to the central repo, its budget, its **sessions per issue** (estimates) | **subscriptions**, **bills and real charges** of every service and provider, how they split over projects, the overview, the tooling, the schema |
| who writes | the orchestrator, at merge (§3.9) | Tilman or a monthly session (bills, subscriptions); tools and adapters |
| who reads | the orchestrator, the issue and board, the central report | Tilman, whoever he shares it with, the dashboard, apps such as the scutoons storyboard (§3.7) |

**The rule:** list-price *estimates* of agent work may sit in a project repo, the same figure the issue's closing comment
shows. Real money stays in the private repo only: subscriptions, bills, EUR, credit balances. osct is public (§3.6).

### 3.2 `agents/costs.json` – per project, on `develop`

A file. Once it grows, it becomes a folder `agents/costs/` with one file per month and `agents/costs.json` as the
index. It is **written only by the orchestrator on `develop`**, so it never conflicts in merges. Changes in `agents/` need no version bump
(RULES #23).

```json
{
  "schema": 1,
  "project": "osct",
  "central": "https://github.com/mandymozart/costs",
  "budget": { "monthly_est_usd": 300, "per_issue_hint_usd": { "design": 5, "feature": 20 } },
  "entries": [
    { "date": "2026-10-29", "issue": [28, 29], "role": "worker", "service": "claude-cloud", "kind": "usage",
      "session": "session_01AabNG9LQhaNiESL1TuMzMP", "model": "claude-opus-5-5", "unit": "tokens", "quantity": 38500884,
      "est_usd": 12.16, "paid_from": "cloud-credit", "source": "result-event" },
    { "date": "2026-10-31", "issue": [242], "role": "worker", "service": "claude-cloud", "kind": "usage",
      "session": "session_01AabNG8dMQq5pG2cR11qY1R", "est_usd": null, "paid_from": "cloud-credit", "source": "result-event" },
    { "date": "2026-10-31", "issue": ["<shift issue>"], "role": "orchestrator", "service": "claude-local", "kind": "usage",
      "session": "<session-id>", "est_usd": null, "paid_from": "extra", "source": "transcript" }
  ]
}
```

(The budget figures are only examples. `null` means not collected yet.)

- `issue` comes from the title's `#N …` (several: `#28+#29` → split evenly unless the orchestrator says otherwise).
  If the title has no number, the entry has no issue: the "untracked" bucket, shown as such.
- `role`: `worker` · `orchestrator` · `subagent` (only if it ever needs splitting out).
- `service`: `claude-local`, `claude-cloud`, `flora`, `gh-actions`, `<video provider>`, … A new service adds a value,
  not a field.
- `kind`: `usage` (sessions, runs, generations). Subscriptions and bills live in the central repo only.
- `est_usd` is **always an estimate**: list price, or the service's own reported figure. There is no `billed` field
  here on purpose (§3.6).
- `paid_from`: `plan` · `extra` · `cloud-credit` · `cloud-plan` · `<service>` (§4). `source` says where the figure
  came from.

### 3.3 The central private repo `mandymozart/costs`

```
costs/
  README.md                     generated: per month × project × service, budgets, what is left, upcoming renewals
  schema.json                   the contract for every file here and every agents/costs.json (versioned, like shared/)
  services.json                 every service and provider: kind (subscription | usage | both), currency, where its
                                bill or usage page is, adapter, which projects use it
  subscriptions.json            every subscription (§3.4)
  bills/2026-10.json            real charges per month: invoices, usage pages, provider charge exports, credit packs
  sources/<app>/2026-11.json    charges an app logs itself (provider run ids), for reconciling (§3.7)
  projects/<project>.json       only for a public repo that keeps no figures itself (§3.6)
  tools/                        transcript costing, result reader, price table, provider adapters, report
  dashboard/overview.json       the data behind the shareable page (§3.5)
```

- The report reads every project's `agents/costs.json` through the GitHub API. Nothing is copied, nothing stored twice.
- Invoices (PDFs) stay where they are now (the `taxes` repos). `bills/` holds the amount, the date and a reference.
- No secrets in the repo: no card data, no API keys. The adapters read their keys from the environment.

### 3.4 Subscriptions

```json
{ "service": "claude", "plan": "Ultra", "amount": null, "currency": "EUR", "period": "month",
  "since": null, "renews": null, "cancel_by": null,
  "split": "by-est-usd", "notes": "weekly limits; extra usage billed separately, see bills/" }
{ "service": "flora", "plan": null, "amount": null, "currency": "USD", "period": "month",
  "split": { "scutoons": 1.0 } }
{ "service": "<video provider>", "plan": "credits", "amount": null, "currency": "USD", "period": "pack",
  "credits": null, "split": "by-usage" }
```

- **Fixed per period:** the amount is spread over the projects by `split`. That is either fixed shares
  (`{ "osct": 0.5, … }`) or `by-est-usd`, meaning each project's share of the month's estimated usage of that service
  (right for Claude Ultra).
- **Credit packs** (common with video and image providers): buying the pack is a bill. Each run is a usage entry with
  `est_usd` = credits used × pack price ÷ pack credits.
- **`renews` / `cancel_by`:** the monthly check lists what renews next month, so nothing renews unnoticed.
- The amounts are Tilman's to fill in. Nothing here is guessed.

### 3.5 Online and shareable

- **The private repo is the shared place.** Share it by inviting someone with read access. GitHub renders the
  generated `README.md` tables.
- **A dashboard page:** a private claude.ai artifact (dashboard), published from `dashboard/overview.json` by the
  monthly run or the orchestrator. It is private by default, and Tilman can share it by link when he wants. GitHub
  Pages is no good for this: it needs a paid plan on a private repo, and the page itself would be public.
- Alternatively a Google Sheet that imports `overview.json`. Only if someone needs to edit it by hand.

### 3.6 Public repos: osct is public

`mandymozart/osct` is public (so are vred, palazzo-listening, resradio and others), and scutoons and nadeos are
private. Whatever osct's `agents/costs.json` or its issue comments say, the world can read.
- **Proposed default:** public repos carry list-price estimates per issue, a measure of the agent work, the same as
  the closing comment. No subscriptions, no bills, no EUR.
- **If even that is too much:** osct's `agents/costs.json` holds only the project key and the link, and its entries go
  to `costs/projects/osct.json` in the central repo. The closing comment then says "cost recorded" without a figure.
  This is a decision (§7).

### 3.7 Apps that read it: the scutoons storyboard

Tilman, 2026-11-01: *"scutoons storyboard wird darauf auch zugreifen müssen, um Kosten zumindest abzugleichen."*

- **Reconciling:** I assume the storyboard runs generations (image, video) through providers and knows what each run
  reported. **This is a guess**: scutoons is not in this session's scope. Reconciling then means matching its own log
  (provider, run id, reported cost, shot or scene, issue if any) against the provider's charges in `bills/` by run id
  and month. The report shows what matches, what the provider charged that the storyboard doesn't know, and the
  other way round.
- **Read access:** through the GitHub contents API, with a fine-grained token that has **read-only access to the
  `costs` repo and nothing else**, kept on the server side (never in a browser bundle). Or, more simply, it reads the
  published `overview.json`.
- **Write access, at first none:** the storyboard keeps its run log, and the monthly run imports it into
  `sources/scutoons-storyboard/`. If it should write directly later, it gets a second token with write access, limited
  to `sources/` by review (a PR) or by a bot account.
- **The contract** is `schema.json` in the central repo, with a version number, so the storyboard, the tools and every
  `agents/costs.json` agree. Changes follow the same rules as osct's content schema: a new field is a MINOR, a removed
  or renamed one a MAJOR.
- Any other app that spends money on a provider follows the same pattern: a run log in `sources/<app>/`, a read
  token, matching by run id.

### 3.8 On the issue and on the board

- **Issue:** the orchestrator's closing comment on `develop` (it is needed anyway, see ORCHESTRATION.md) gets one line:
  `Cost: ≈ $14.80 list (2 sessions: worker $12.16 cloud credit, orchestrator share $2.64 plan) – estimate.`
  (The figures are an example.)
- **Board:** a number field *"Cost (USD, est.)"* on the project board, set by the orchestrator. The board then
  sums by lane or label. Every project gets the same field.

### 3.9 Who writes it

| what | who | when | how |
| --- | --- | --- | --- |
| cloud worker sessions | **orchestrator** | at merge | `list_events(kinds: ["result"])` on the worker's session → sum of `model_usage_since_last_result`; title → issue; entry in `agents/costs.json` |
| local worker sessions (worktrees) | **orchestrator** | at merge | the transcript script (§2.2) on the worker's `session-id` (the orchestrator runs on the same machine) |
| the orchestrator itself | **orchestrator** | at the end of the shift (and once a day in long shifts) | its own earlier `result` events (cloud) or its own transcript (local); booked to its shift issue |
| sessions no orchestrator sees (ad hoc, chats about code) | **`SessionEnd` hook** (user level, all projects) | when the session ends | transcript script → a row in a workspace inbox (§6), taken into the project's `agents/costs.json` by the next orchestrator run |
| the worker itself | **worker** | in its final report | "Cost so far: ≈ $x" from its own transcript. Only a hint (the last turn is missing). The orchestrator's figure counts |
| subscriptions | **Tilman** | when one starts, changes or ends | `subscriptions.json` in the central repo |
| monthly bills, provider charges | **Tilman** or a monthly session | on the 1st | `bills/<month>.json`: extra-usage EUR, cloud credit used, Flora, video providers, …; then the report and the dashboard |
| app run logs (storyboard) | **the app**, imported by the monthly run | monthly | `sources/<app>/<month>.json` |

**Orchestrator sessions** (Tilman's addition): every orchestrator shift starts with its own issue, as RULES #30 already
asks of every session, e.g. `#N Night shift 31.10`. Its cost is booked to **that issue** as `role: orchestrator`.
That keeps it visible as overhead. The report can additionally *show* each worker issue's share of the orchestrator
(split by the workers' `est_usd`), but the entry itself stays with the shift issue, so nothing is counted twice.

---

## 4. From plan usage to an estimate, kept apart from real charges

What pays for a session, and what the ledger can know about it:

| `paid_from` | what it is | per session | real money |
| --- | --- | --- | --- |
| `plan` | local session within the weekly limit (Ultra) | `est_usd` (list) | none extra: the flat subscription |
| `extra` | local session after the weekly limit | `est_usd` (list) | monthly EUR from claude.ai, spread over these rows |
| `cloud-credit` | cloud session while the $250 credit lasts | `est_usd` (list) | **open** whether the credit is drawn at list (§2.7); monthly from the balance |
| `cloud-plan` | cloud session after the credit (from 2026-11-05) | `est_usd` (list) | like `plan` / `extra` |
| `flora`, … | another service | the service's own figure | usually charged directly → the central repo's `bills/` |

- **How a row gets its `paid_from`:** the status line's `rate_limits.seven_day.used_percentage` (§2.3) says whether the
  weekly limit was reached. If there is no status line, the time of the session is compared with the time the limit
  was hit, which the orchestrator notes when Claude Code reports it ("You've hit your weekly limit"). Cloud sessions
  before 2026-11-05 are `cloud-credit`.
- **Real charges are never computed per session.** Once a month the bills in the central repo (`bills/<month>.json`:
  EUR extra usage, USD credit used) are spread over the month's `extra` / `cloud-credit` entries in proportion to `est_usd`. That gives an
  *allocated* figure per issue, which the report shows in its own column. Subscriptions are spread over projects by
  their `split` (§3.4). Per issue, the subscription fee can be shown as an effective rate (fee ÷ the month's `plan`
  list USD), clearly marked as a way of looking at it, not as a cost.
- So every issue shows two numbers: **≈ list USD** (always, comparable across months and services) and **allocated
  real money** (once the month's bills are in).
- Currencies stay as charged (EUR, USD). Converting them is the report's job, at the month's rate, in its own column.

---

## 5. Monthly check (5 minutes)

On the 1st: claude.ai → Settings → Usage (extra usage EUR, cloud credit balance), Flora's usage, the video and other
providers, every subscription that was charged. One line each in `bills/<month>.json` in the central repo. The report
then compares estimated against billed, reconciles the apps' run logs (§3.7), lists the subscriptions that renew
next month, and republishes the dashboard. A large gap means something is not being
collected (most likely sessions with no `#N` in the title, or helper calls). The check also answers the open
question of how cloud credits are drawn (§2.7).

---

## 6. For every project in `C:\Development\`

- **Tooling once, in the central repo** (`costs/tools/`, cloned to `C:\Development\costs\`, next to
  `C:\Development\ORCHESTRATION.md`). In it: the transcript costing, the `result` reader (through the claude-code-remote MCP, or the orchestrator calling it
  directly), the price table, the service adapters (Flora, …) and the report. One script for all projects.
- **Project from the path:** the transcript folder (`C--Development-scutoons-…`) or the cloud session's repository
  gives the project. Issue numbers belong to each project's own repo (`osct#242` ≠ `scutoons#242`), so `project` +
  `issue` together are the key.
- **Inbox for the hook:** the `SessionEnd` hook (in `~/.claude/settings.json`, so in every project) appends to
  `C:\Development\.costs\inbox.csv`, outside git. Each project's orchestrator moves its own rows into its repo's
  `agents/costs.json` at its next run. Cloud sessions need no inbox, because their
  `result` events can be read at any time.
- **The same file in every repo:** `agents/costs.json` (key, link, budget, entries), and the same board field. Projects
  without `agents/` use `docs/` or the root. The rule goes into the workspace `ORCHESTRATION.md`, not into each
  project.
- **The workspace overview** (all projects, all services and subscriptions, per month) is the central repo's report
  and dashboard, built from the projects' `agents/costs.json` and its own files. Nothing is stored twice.
- **Later, when there are more machines and services:** OTel (§2.6) into one collector, with
  `OTEL_RESOURCE_ATTRIBUTES=project=…` per project (set in each repo's `.claude/settings.json` `env`) and the issue
  from `ccr.session.id` / `session.id` → title. Only worth it once the scripts stop being enough.

---

## 7. What to decide

1. **Where:** `agents/costs.json` in every project on `develop`, plus the private central repo `mandymozart/costs` for
   subscriptions, bills and the overview. Is that right, and is the name OK? *Recommended: yes.*
2. **Public repos (osct):** list-price estimates per issue in `agents/costs.json` and in the closing comment (the
   proposed default), or only a link, with the figures in the central repo (§3.6)?
3. **Shareable:** the private repo, plus a private claude.ai dashboard Tilman can share by link (recommended), or a
   Google Sheet?
4. **Per-issue line in the closing comment and the board field:** both, or one of them?
5. **Orchestrator overhead:** only on the shift issue (recommended), or also spread over the workers' issues in the
   entries themselves?
6. **Budget per project:** a monthly figure in list USD (in the project file) and/or in EUR real money (central), and
   what happens when it is reached: a note to Tilman, or the orchestrator stops starting new workers.
7. **The scutoons storyboard:** read-only through a token for the `costs` repo (recommended), or only the published
   `overview.json`? And does it log its run costs itself? (§3.7, to be checked in scutoons.)
8. **The cloud credit expires on 2026-11-05.** Run the one reconciliation test (§2.7) before then?

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
3. **Start the central repo by hand:** create the private repo `mandymozart/costs` with one file,
   `subscriptions.json`: every subscription and provider in use, its amount, period and renewal date. About 15
   minutes, no code, and the subscriptions are on record from day one.

After that, in this order:
1. `schema.json` and `agents/costs.json` in each project, filled by the orchestrator at merge.
2. The transcript script, for local sessions and orchestrators.
3. The `SessionEnd` hook and the inbox.
4. The monthly bills and the report, with the dashboard.
5. The provider adapters and the storyboard's read access.

---

*This session (#242, a cloud session) as far as it can see itself:
- **Turn 1 (2026-10-31), the proposal itself:** exactly **$1.640** at list price, from its own `result` event
  (`total_cost_usd`; Opus $1.629 + Haiku helper calls $0.011). The transcript estimate at commit time was $1.44, made
  before the turn's last steps.
- **Turn 2 (2026-11-01), subscriptions, central repo, storyboard:** about **$1.6 more** from the transcript so far, so
  about **$3.3** in total. Paid from: cloud credit, presumably. This turn's `result` event will show whether
  `total_cost_usd` adds up across turns (§2.1, open).*
