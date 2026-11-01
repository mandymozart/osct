# Cost per issue – a proposal (#242)

Tilman, 2026-10-31: *"Messen wie viel Cloud- und Usage-Credits bei diesen Aufgaben verbraucht werden … wie ich pro
Issue am besten für jedes Projekt den Preis tracken kann."* Also: *"zusätzlich sollten orchestrator sessions auch
getrackt werden. projekt budget sollte ggf. teil des repos werden"* and *"ich werde mehrere services in zukunft parallel
benutzen und die sollen alle kosten tracken."* And on 2026-11-01: *"wir halten auch kosten für abos fest. dazu in develop
auch ein ordner agents/costs.json – dieser kann und sollte auch mit einem online shareable punkt verknüpft sein. ggf.
ein privates repo, wo wir alle services tracken. auch jeden anderen provider für video etc."* And: *"Wichtig: Kosten
sollen nur getrackt werden, wenn sie tatsächlich anfallen und nicht Teil des Abos sind."*

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
- **The record, in two places:**
  - Every project has **`agents/costs.json` on `develop`**: the project's key, its budget, its charged work per issue,
    and a link to the central repo.
  - A **private central repo** (proposed name `mandymozart/costs`) holds the subscriptions, the monthly bills, every
    provider's charges (Flora, video, hosting, …), the tooling and the overview. It is the **online, shareable place**:
    invite someone to it, or publish a private dashboard from it that can be shared by link (§3.5).
  - When an issue had a real cost, its closing comment gets a cost line and the board's number field is set.
- **osct is a public repo.** Subscriptions, bills and EUR live only in the private repo. A public repo's
  `agents/costs.json` holds the per-issue extra-usage shares, or only the link (§3.6, decision §7).
- **Who writes it:** the orchestrator at merge, a local hook for sessions no orchestrator sees, and Tilman or a monthly
  session for bills and subscriptions.
- **Orchestrator sessions** are judged by the same rule. If one ran on extra usage, its share is booked to its own shift
  issue, never hidden inside the workers' numbers.
- **Any service:** every entry has the same service-neutral fields (`service`, `kind`, `amount`, `currency`). Apps
  such as the scutoons storyboard read the central repo to reconcile their own run charges (§3.7).
- **Tomorrow:** start the private repo with a `subscriptions.json`. Set `cleanupPeriodDays` to 365. Have the
  orchestrator check `isUsingOverage` at merge and write a cost line only when it is true. No code needed. See §8.

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

## 3. The record

### 3.1 Two places, one rule

| | `agents/costs.json` in every project repo, on `develop` | private central repo `mandymozart/costs` |
| --- | --- | --- |
| what | the project's key, a link to the central repo, its budget, its **charged work per issue** (extra-usage shares, provider charges) | **subscriptions**, **bills and real charges** of every service and provider, how they split over projects, the overview, the tooling, the schema |
| who writes | the orchestrator, at merge (§3.9) | Tilman or a monthly session (bills, subscriptions); tools and adapters |
| who reads | the orchestrator, the issue and board, the central report | Tilman, whoever he shares it with, the dashboard, apps such as the scutoons storyboard (§3.7) |

**The rules:** only real charges are recorded (§1, §4). Usage within the plan and on the included credit is not. In a
public repo, no EUR amounts, subscriptions or bills, only in the private repo (§3.6).

### 3.2 `agents/costs.json` – per project, on `develop`

A file. Once it grows, it becomes a folder `agents/costs/` with one file per month and `agents/costs.json` as the
index. It is **written only by the orchestrator on `develop`**, so it never conflicts in merges. Changes in `agents/` need no version bump
(RULES #23).

```json
{
  "schema": 1,
  "project": "osct",
  "central": "https://github.com/mandymozart/costs",
  "budget": { "monthly_eur": 50, "covers": "extra usage and provider charges of this project" },
  "entries": [
    { "month": "2026-11", "issue": [251], "role": "worker", "service": "claude", "kind": "extra-usage",
      "session": "<session id>", "list_usd": 6.40, "share": 0.21, "amount": null, "currency": "EUR",
      "source": "isUsingOverage + result-event; amount set when the November bill is in" },
    { "month": "2026-11", "issue": ["<shift issue>"], "role": "orchestrator", "service": "claude", "kind": "extra-usage",
      "session": "<session id>", "list_usd": 3.10, "share": 0.10, "amount": null, "currency": "EUR", "source": "transcript" }
  ]
}
```

(All figures, including the budget's, are examples. `null` means not known yet.)

- `issue` comes from the title's `#N …` (several: `#28+#29` → split evenly unless the orchestrator says otherwise).
  If the title has no number, the entry has no issue: the "untracked" bucket, shown as such.
- `role`: `worker` · `orchestrator` · `subagent` (only if it ever needs splitting out).
- `kind`: `extra-usage` (Claude past the plan) · `charge` (a provider's pay-per-use charge caused by this issue, e.g. a
  video render outside any quota). Subscriptions, purchases and bills live in the central repo only.
- **Only sessions that cost money get an entry.** A session within the plan, or on the cloud credit, gets none.
- `list_usd` is the extra-usage part of the session at list price. It is only a **weight** for the split, not a cost.
  `share` is its part of the month's extra usage. `amount` + `currency` is the real money: share × the month's bill.
  It is filled in once the bill is in (§4). For a `charge`, `amount` is the provider's charged figure straight away.
- `source` says where the figures came from.

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
  "split": { "osct": 0.5, "scutoons": 0.4, "nadeos": 0.1 }, "notes": "extra usage billed separately, see bills/" }
{ "service": "flora", "plan": null, "amount": null, "currency": "USD", "period": "month",
  "split": { "scutoons": 1.0 } }
{ "service": "<video provider>", "plan": "credits", "amount": null, "currency": "USD", "period": "pack",
  "credits": null, "split": { "scutoons": 1.0 } }
```

- **Fixed per period:** the fee is recorded once per period as a fixed cost. If wanted, it is split over projects by
  fixed shares (`split`, examples above). It is **never** spread over issues: work within the plan costs nothing extra.
- **Credit packs** (common with video and image providers): **buying the pack is the cost**, one line in `bills/`. The
  runs that draw it are not costs. The storyboard's run log still records them, for reconciling (§3.7).
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
- **Proposed default:** a public repo's `agents/costs.json` holds the per-issue extra-usage entries (share and list
  weight) without the EUR amount. The amount stays in the central repo. No subscriptions, no bills.
- **If even that is too much:** osct's `agents/costs.json` holds only the project key and the link, and its entries go
  to `costs/projects/osct.json` in the central repo. The closing comment then says "extra usage recorded" without a
  figure. This is a decision (§7).

### 3.7 Apps that read it: the scutoons storyboard

Tilman, 2026-11-01: *"scutoons storyboard wird darauf auch zugreifen müssen, um Kosten zumindest abzugleichen."*

- **Only real charges count** here too: runs inside a plan's quota or drawn from a credit pack already bought are not
  costs. The run log matters for reconciling: did the provider charge for runs the storyboard thinks were included?
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

- **Issue:** only when the issue had a real cost, the orchestrator's closing comment on `develop` (it is needed anyway,
  see ORCHESTRATION.md) gets one line:
  `Cost: extra usage, ≈ 21 % of November's bill (2 sessions, list weight $9.50) – amount when the bill is in.` Or, for
  a provider: `Cost: 3 video renders, $4.20 charged.` (The figures are examples.) An issue without real cost gets no
  line.
- **Board:** a number field *"Cost (EUR)"*, set once the month's bill is in (or straight away for a provider charge).
  It stays empty for issues without real cost. Every project gets the same field.

### 3.9 Who writes it

| what | who | when | how |
| --- | --- | --- | --- |
| cloud worker sessions | **orchestrator** | at merge | `list_events(kinds: ["rate_limit_event"])`: was `isUsingOverage` ever true? If not → nothing to record. If so → that part's cost from the `result` events (§2.1) as the weight, an entry in `agents/costs.json` |
| local worker sessions (worktrees) | **orchestrator** | at merge | was the weekly limit used up while it ran (§4)? If so → the transcript script (§2.2) on the part after that moment |
| the orchestrator itself | **orchestrator** | at the end of the shift | the same two checks on its own session; booked to its shift issue |
| sessions no orchestrator sees | **`SessionEnd` hook** (user level, all projects) | when the session ends | the same check → a row in a workspace inbox (§6) only if it ran on extra usage |
| provider charges caused by an issue | **whoever started the run** (worker, orchestrator, an app's log) | when charged | `kind: charge` with the provider's charged figure |
| subscriptions | **Tilman** | when one starts, changes or ends | `subscriptions.json` in the central repo |
| monthly bills, purchases | **Tilman** or a monthly session | on the 1st | `bills/<month>.json`: extra usage EUR, provider charges, credit packs, subscription fees; then the shares get their `amount`, and the report and the dashboard are rebuilt |
| app run logs (storyboard) | **the app**, imported by the monthly run | monthly | `sources/<app>/<month>.json`, for reconciling only |

**Orchestrator sessions** (Tilman's addition): every orchestrator shift starts with its own issue, as RULES #30 already
asks of every session, e.g. `#N Night shift 31.10`. If it ran on extra usage, that part is booked to **that
issue** as `role: orchestrator`. That keeps it visible as overhead, and nothing is counted twice.

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
- At the end of the month: the bill's EUR (claude.ai → Settings → Usage, extra usage) × each entry's `share` =
  `amount`. The shares add up to 100 % of the month's extra usage, so the per-issue amounts add up to the real bill.
- Anything in the bill that no entry explains (a session without `#N`, a chat on claude.ai, idle check-ins) stays
  visible as **unassigned**, not spread over the issues.

## 5. Monthly check (5 minutes)

On the 1st:
1. Read the extra-usage EUR from claude.ai → Settings → Usage.
2. Read the provider charges and purchases (Flora, video and the others) and the subscription fees actually charged.
3. Write one line each into `bills/<month>.json` in the central repo.

The report then:
- fills the extra-usage entries' `amount`,
- shows what stays unassigned,
- reconciles the apps' run logs (§3.7),
- lists the subscriptions that renew next month,
- and republishes the dashboard.

A month without extra usage has no Claude entries at all, only the fixed fees.

---

## 6. For every project in `C:\Development\`

- **Tooling once, in the central repo** (`costs/tools/`, cloned to `C:\Development\costs\`, next to
  `C:\Development\ORCHESTRATION.md`). In it: the extra-usage check (`isUsingOverage`, the window log), the transcript costing, the `result` reader (through the claude-code-remote MCP, or the orchestrator calling it
  directly), the price table, the service adapters (Flora, …) and the report. One script for all projects.
- **Project from the path:** the transcript folder (`C--Development-scutoons-…`) or the cloud session's repository
  gives the project. Issue numbers belong to each project's own repo (`osct#242` ≠ `scutoons#242`), so `project` +
  `issue` together are the key.
- **Inbox for the hook:** the `SessionEnd` hook (in `~/.claude/settings.json`, so in every project) checks whether the
  session ran in an extra-usage window. Only then does it append to
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

1. **The rule** (§1, §4): only extra usage, pay-per-use charges, purchases and subscription fees. Nothing within the
   plan, nothing on the included cloud credit. *As Tilman said, 2026-11-01.* Subscription fees: per project by fixed
   shares, or only as one total?
2. **Where:** `agents/costs.json` in every project on `develop`, plus the private central repo `mandymozart/costs`.
   Is that right, and is the name OK?
3. **Public repos (osct):** the per-issue extra-usage shares without EUR (proposed), or only a link (§3.6)?
4. **Shareable:** the private repo, plus a private claude.ai dashboard Tilman can share by link (recommended), or a
   Google Sheet?
5. **Budget per project:** a monthly EUR cap on its real costs (extra usage + provider charges). What happens when it
   is reached: a note to Tilman, or the orchestrator starts no new workers while extra usage is on?
6. **The scutoons storyboard:** read-only through a token for the `costs` repo (recommended), or only the published
   `overview.json`? (§3.7, to be checked in scutoons.)

---

## 8. The smallest first step (tomorrow, no code)

1. **Start the central repo by hand:** create the private repo `mandymozart/costs` with `subscriptions.json`: every
   subscription in use, its fee, period and renewal date. About 15 minutes, and the fixed costs are on record from
   day one.
2. **One step in the orchestrator's merge routine** (workspace `ORCHESTRATION.md`):
   > *Before closing a worker's issue: `list_events(<worker session>, kinds: ["rate_limit_event"])`. If no event has
   > `isUsingOverage: true`, there is nothing to record. If one does, write `Cost: extra usage, list weight $x` into
   > the closing comment (x from the `result` events from that point on) and tell Tilman.*

   Most issues will show nothing, which is correct. The ones that do are exactly where money went.
3. **Keep the raw data:** `"cleanupPeriodDays": 365` in `C:\Users\<you>\.claude\settings.json`, so local sessions in
   an extra-usage window can still be costed when the bill comes.

After that, in this order:
1. The extra-usage window log and the transcript script, for local sessions.
2. `agents/costs.json` in each project, and the monthly bill with the split.
3. The `SessionEnd` hook.
4. The report and the dashboard.
5. The provider adapters and the storyboard's read access.

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
- **Turn 3** (2026-11-01, "only real costs"): about **$0.7** so far from the transcript, so about **$4.4** in total.*
