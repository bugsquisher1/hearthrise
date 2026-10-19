# The bug triage loop

> **For the scheduled agent that runs this.** Read this file, then run the loop
> below. Tyler's directive, 2026-08-17: *"link up a bug report to your connection
> so you can fix them as they come in instead of me monitoring them."* The point
> of this loop is that **nobody has to watch a Discord channel.** Discord stays —
> it is the human-visible lane, and Tyler still sees every report land there —
> but it is no longer the queue. `public.bug_reports` is the queue.

---

## What already existed, and what this loop adds

Intake was never the missing piece. A report from the 🐛 button already:

- requires a signed-in player (there is no anonymous path),
- is attributed to a **server-verified `auth.uid()`** — the client's `user` field
  is display-only and the relay ignores it,
- is bounded (summary 200, description 4000, state 16 KB, 20 console entries),
- is rate-limited **6/hour and 20/day per account** inside `bug_report_submit`,
- collapses replays on a per-user idempotency key, so a retry can never
  double-post, and
- is written to `public.bug_reports` by the RPC **before** Discord is forwarded
  to — Postgres is the only writer; the Edge Function never writes a table.

What was missing was the **operator half**: anywhere to record what was *done*
about a report. The only triage field was `resolved boolean` — one bit that
cannot tell "nobody has looked at this yet" apart from "looked at, reproduced,
not fixing", and carries no note. So triage lived in Tyler's head.
`2026-08-17-bug-triage.sql` adds the state that makes the loop **resumable**:

| Column | Meaning |
| --- | --- |
| `status` | `new` → `triaged` → `fixed` \| `wontfix`. The authority. |
| `triage_note` | Why. ≤ 2000 chars. Prose, not a payload. |
| `triaged_at` | Server clock. Stamped by trigger; a caller cannot backdate it. |
| `resolved` | **Derived** from `status`. Never written by hand. |

---

## The loop

Run it on a schedule. Every step is idempotent; a crashed run leaves the queue in
a state the next run can pick up, because `status` is durable and per-report.

### 1. Read the queue

```bash
node tools/triage-bugs.mjs stats
node tools/triage-bugs.mjs list --status new
node tools/triage-bugs.mjs show <id>
```

`list` is **oldest first** deliberately — the queue is FIFO so a report cannot
starve behind newer noise. It projects the SPA screen (`state.activeTab`), the
device line, the console-error count, and whether a screenshot exists.

#### The queue has TWO halves, and the server's half prints first

A player-filed report is the **slowest detector this project has**: it needs a
player to notice, to care, and to type. The server already knows — `hr_apply`
records every refusal into `public.hr_rejections` and **derives** a severity from
the code, where `incident` means *"a caller proposed something an honest game
loop cannot propose"* (`2026-08-11-player-state.sql` §6b-ii).

On the night of **2026-08-17, 51 aggregated `unknown_skill` rejections at
severity `incident` sat there and were read by nobody until morning**, because
this loop only ever looked at `bug_reports`. Every one of them was a player
losing a whole accrual window. So `list` and `stats` now read both, and the
server's half prints **first**:

```bash
node tools/triage-bugs.mjs list                      # reports + incidents
node tools/triage-bugs.mjs incidents                 # just the server's half
node tools/triage-bugs.mjs incidents --min-n 20 --days 1
node tools/triage-bugs.mjs list --no-incidents       # reports only (scripts)
```

| Flag | Default | What it does |
| --- | --- | --- |
| `--min-n <n>` | `5` | Threshold on the **SUM** across rows, not on one row's `n` |
| `--days <d>` | `7` | Only rejections whose `last_at` falls in the window |
| `--limit <n>` | `20` | Cap on codes listed (`incidents` only) |
| `--no-incidents` | off | Suppress the server's half (`list` only) |

**The threshold is on the sum, and that is the whole design.** `hr_rejections`
keys on `(user_id, slot, day, code)`, so that night's 51 was **not** one row of
`n=51` — it was six rows of single digits across three characters and two dates.
A per-row threshold of 10 looks correct, reads correctly in review, and would
have shown **nothing**. `tests/bug-triage.mjs` R1 uses the real distribution and
its `per-row-threshold` mutant must read RED.

Two things the output deliberately does **not** contain: `severity` is not a
parameter (it is derived server-side by `hr_record_rejection` and a caller
cannot widen it into a firehose), and **no player UUIDs** — the aggregate counts
distinct characters instead, and `last_detail` is passed through a key allowlist
plus a UUID redaction before it reaches either the terminal or `--json`.
`forbidden_impersonation` records `claimed_user`, a *third party's* id, and this
output gets pasted into tickets and Discord. Guarded by R8.

#### `list --json` shape

`list --json` returns **`{ reports, incidents }`**. It was a bare array of
reports; a consumer that kept the array shape would silently never see the
server's half, which is the defect this closes. `list --no-incidents --json`
still returns the bare array for anything that genuinely only wants reports.
`incidents --json` returns a bare array of code aggregates.

**Screenshots are not in the table.** They are Discord attachments. Storing a
base64 copy would inflate the one database that holds every player's
progression, and restores here run off *daily backups*, so table size is restore
time. When `show` says a screenshot exists, go look at the Discord message for
that report id.

### 2. Reproduce before believing

A bug report is a **claim**, not a finding. `state` carries build, screen,
viewport, physical screen, DPR, zoom, root font-size, safe-area insets,
orientation, skill levels, inventory count and the last 20 console errors —
enough to reconstruct the situation. Reproduce at the reported **build** and the
reported **viewport**; the single most common false lead is a layout bug that
only exists at 922×423 or under boosted OS font size.

If it does not reproduce, that is a *result*, not a failure — record it in the
note. Do not mark a report fixed because the code looks right.

### 3. Fix, or file, or decline

- **Fix it** → the fix ships with a test in the same commit. Non-negotiable
  (`CLAUDE.md`, testing discipline). A bug fix gets a regression test under
  "regression suite" in `src/features/smoke-test.js` that **fails without the
  fix**. If the second occurrence of a bug has no guard, write the guard first.
- **Can't fix it here** → file it into the relevant coordination file / agent log
  with the report id, and mark `triaged` with a note saying where it went.
- **Won't fix** → `wontfix` with a note that a human would accept as a reason.
  "Working as intended" alone is not a reason; say *why* it is intended.

### 3b. Close every incident line — **the ack rule**

An incident line is **not** closed by reading it, and it has no `status` column
to mark: `hr_rejections` is an append-only aggregate the server owns, pruned at
180 days. Left to itself it will still be there tomorrow, one number larger, and
the run after this one will see the same line and assume somebody already looked
— which is exactly how 51 rejections survived a night.

**An incident code is closed by creating a durable artefact that NAMES it:**

- a `bug_reports` row whose `summary` contains the code (file it yourself; you
  are an operator on the management API, so your insert is exempt from the
  per-user backstop), **or**
- an entry in `.claude/coordination/` (`ACTIVE_WORK.md` for something you are
  taking now, `BACKLOG.md` for something triaged and deferred) whose text
  contains the code.

Either way the artefact must carry the **code**, the **count**, the **window**,
and either a fix, an owner, or a stated reason it is benign. "Benign" needs the
same standard as `wontfix`: say *why*, and a human has to accept it.

**A run that reports an incident line and creates no artefact for it has not
finished.** That is the failure mode this section exists for, and it is
invisible unless it is written down as a rule — so it is written down here, and
the routine's prompt contract below repeats it, because a rule only in a design
doc is a rule the scheduled run does not read.

> **Prompt contract for the scheduled triage routine.** Whatever dispatches this
> loop MUST include, verbatim in the routine's instructions:
>
> > Run `node tools/triage-bugs.mjs list`. It prints **two** queues: player bug
> > reports **and** server-side incident codes from `hr_rejections`. **Both are
> > your responsibility.** For every incident line, either fix the cause or
> > create a durable artefact naming the code — a `bug_reports` row, or an entry
> > in `.claude/coordination/ACTIVE_WORK.md` or `BACKLOG.md` — recording the
> > code, the count, the window, and a fix, an owner, or a reason it is benign.
> > Do not end the run with an unacknowledged incident line. An incident code is
> > the server telling you a caller proposed something an honest game loop
> > cannot; the 2026-08-17 `unknown_skill` outage was 51 of them, read by nobody
> > until morning.

### 4. Update status

```bash
node tools/triage-bugs.mjs mark <id> triaged --note "reproduced at 922x423; layout, handed to art-director"
node tools/triage-bugs.mjs mark <id> fixed   --note "b364 — combat panel icon slot given an explicit size"
node tools/triage-bugs.mjs mark <id> wontfix --note "screenshot shows a browser extension injecting CSS; not our DOM"
```

Only `status` and `triage_note` are written. `resolved` and `triaged_at` are
derived server-side, so a row can never end up with a boolean that contradicts
its status.

Do this **as you go**, not in a batch at the end. If the run dies halfway, the
work already done must not be repeated.

### 5. Summarise to Discord

Post a short digest through the existing changelog path — the webhook lives at
`~/.hearthrise/changelog-webhook` and is never in the repo:

```bash
node tools/post-changelog.mjs <message-file> --dry-run   # ALWAYS first
node tools/post-changelog.mjs <message-file>
```

`--dry-run` first, every time: a post reaches real players and cannot be un-sent.
Keep the digest to what a player cares about — what was fixed — not the internal
triage bookkeeping.

### 6. Notify Tyler — **P0 or blocked only**

`PushNotification` is for blockers **only he can clear** and major milestones. It
is not a progress report. Use it when, and only when:

- **P0** — data loss, an economy/authority hole, players locked out, or the game
  not loading, and
- **blocked** — something you cannot resolve yourself: a credential, a Discord or
  Supabase dashboard action, a product decision that is genuinely his.

Everything else waits for the digest. A routine triage run that fixed three
layout bugs sends **nothing**. Exhaust every path yourself before naming him as a
blocker.

---

## Rules that bound this loop

- **An incident line is closed by an artefact, never by having been read.** See
  §3b. `hr_rejections` has no status column and the server will not stop
  counting; the only durable record that somebody looked is a `bug_reports` row
  or a coordination entry naming the code.
- **Never mark a report fixed you did not verify.** Same standard as everything
  else here: *"I know this works because I verified it"*, never *"it should
  work."*
- **Triage state is operator-only, and must stay that way.** There is no client
  UPDATE or DELETE policy on `bug_reports`, so a reporter cannot mark their own
  bug fixed and reports stay append-only. `tests/bug-triage.mjs` fails if a
  policy ever appears. Triage therefore runs on the management API
  (`~/.supabase-token`), not through the game client.
- **The client files each report exactly once.** The relay writes the row *and*
  forwards to Discord; the direct table insert is a **fallback for when the relay
  is unreachable**, never a second write. Do not "also insert after the Discord
  send" — that files every report twice and defeats the idempotency key. Guarded
  by `tests/bug-triage.mjs`.
- **Rate limits are two-layer, on purpose.** `bug_report_submit` enforces 6/hour
  + 20/day. A per-user **40/day backstop trigger** catches every other insert
  path, including the direct fallback that bypasses the RPC entirely. The
  backstop is deliberately looser so it never fires on legitimate traffic — if
  you ever see it fire, that is abuse or a client retry loop, not a busy tester.
- **Don't grow the RPC's argument list.** `bug_report_submit` is pinned at six
  arguments in `tests/rpc-resolution.targets.json` and mirrored by an A9
  `bug_report_submit__ungated` twin. `create or replace` keys on arity, so a
  seventh parameter creates a **new overload**, makes PostgREST resolution
  ambiguous, and grows the ungated-RPC census. New diagnostic fields go inside
  the `state` jsonb, which the Edge Function composes server-side.

---

## Where the pieces live

| Piece | File |
| --- | --- |
| Client + capture + queue | `src/bug-report.js` |
| Edge relay → Discord | `supabase/functions/bug-report-bridge/index.ts` |
| RPC, caps, idempotency | `supabase/migrations/2026-08-11-bug-report-relay.sql` |
| Table reconstruction | `supabase/migrations/2026-08-10-dr-bug-reports-base.sql` |
| Triage state + backstop | `supabase/migrations/2026-08-17-bug-triage.sql` |
| Operator CLI | `tools/triage-bugs.mjs` |
| The server's own queue | `public.hr_rejections` (`supabase/migrations/2026-08-11-player-state.sql` §6b-ii) |
| Guard | `tests/bug-triage.mjs` (in the smoke suite; `--mutate` for the self-test) |
| Setup / webhook secret | `docs/reports/BUG_REPORT_PIPELINE.md` |
