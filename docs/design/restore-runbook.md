# Restore runbook — production is gone at 3am

**Owner:** Reliability Engineer.
**Status of the thing this document is about:** **NO RESTORE HAS EVER BEEN TESTED.**
Everything below is either measured (marked ✅ with the date) or staged and unexecuted
(marked **NOT EXECUTED**). Nothing in here has been proven end to end, and until §9 has
been run once, this is a plan and not a capability.

**Last re-verified against live production: 2026-08-15 ~20:55 UTC.** That pass re-measured
backups, health, disk, pooler, roles, cron, row counts and object counts; it corrected the
schema digest, the seeded-table count, the Edge Function version, the `player_*` row
inventory and the method used to check role passwords; and it added §6a (custom-role
recovery) and the connection-headroom model in §11. **Restore-readiness: the schema half and
the inventory half are proven by execution; the restore mechanism itself remains 0% proven.
See §12.**

**Why this exists.** Today the database losing everything is survivable: every player's
browser holds a copy of their save and `game_saves` is a cache of it. **After cutover that
stops being true.** `player_state` / `player_skills` / `player_inventory` /
`player_ledger` become the sole record of every player's progression, there is no client
copy by design (CLAUDE.md, "Server authority"), and a repo rebuild returns all of them
**empty**. From that moment the only thing standing between a bad day and every player
losing everything is a backup that nobody has ever restored.

---

## 0. The one-paragraph version

Backups exist and are healthy: **8 daily physical (WAL-G) backups, all `COMPLETED`, newest
2026-08-15 10:26:47 UTC** ✅ — **re-verified 2026-08-15 20:55 UTC, unchanged, newest 10h29m
old, zero `FAILED`, eight consecutive days with no gap** ✅. PITR is **off**, so the accepted
data-loss window is **up to 23h59m**. The repo rebuilds the schema and every catalogue
exactly — **22 seeded tables** (`hr_unlocks` shipped 2026-08-15) **plus 8 of production's 9
cron jobs** ✅ — so a restore only ever has to carry *rows*, never structure. **36 tables come
back empty from a repo rebuild and only a backup has them**, and four of those matter in a
way nothing else does: `auth.users` (outside `public`, created by no file, the root of 17
foreign keys), the `player_*` progression tables, `display_names`, and `hr_server_secrets` —
which rebuilds to the right *count* and the wrong *value*. The restore mechanism on Pro with
physical backups is **in-place restore (API-callable)** or **Restore to a New Project
(dashboard-only)**; the second changes the project ref and therefore the client URL, the Edge
Function secrets and the engine role's password. Recommendation: **turn PITR on at cutover,
not before** (§8).

> ⚠ **CHANGED 2026-08-15 — the `player_*` tables are no longer empty.** Every prior revision
> of this document recorded `player_state = 0`. Production now holds **state 2 · skills 30 ·
> inventory 11 · equipment 2 · farm 8 · progress 3 · ledger 29** ✅. That is test-generated,
> not player-generated, and it is still disposable — but it means the sole-record property
> has started arriving in fact rather than in plan, and the §8 PITR trigger ("before the
> first real player progression is written") is now the nearest gate in this document.

---

## 1. What backups actually exist — MEASURED, not assumed ✅

Measured 2026-08-15 via `GET /v1/projects/nezapsylztqbbwuwembx/database/backups`
(read-only, Management API, executed). **Re-executed 2026-08-15 20:55 UTC — byte-identical
response, same 8 ids, same timestamps** ✅.

```
region        us-west-2
pitr_enabled  false          ← the loss window is a whole day, not minutes
walg_enabled  true           ← backups are PHYSICAL (WAL-G), not pg_dump
physical_backup_data  {}     ← empty because there is no PITR window to describe
```

| # | Backup id | Taken (UTC) | Status | Type |
|---|---|---|---|---|
| 1 | `1381873494` | 2026-08-15 10:26:47 | COMPLETED | physical |
| 2 | `1372530398` | 2026-08-14 10:25:54 | COMPLETED | physical |
| 3 | `1363165391` | 2026-08-13 10:29:05 | COMPLETED | physical |
| 4 | `1353911455` | 2026-08-12 10:30:21 | COMPLETED | physical |
| 5 | `1344708798` | 2026-08-11 10:30:55 | COMPLETED | physical |
| 6 | `1336153078` | 2026-08-10 10:29:13 | COMPLETED | physical |
| 7 | `1328561497` | 2026-08-09 10:28:05 | COMPLETED | physical |
| 8 | `1320163716` | 2026-08-08 10:25:55 | COMPLETED | physical |

**What that means, precisely.**

* **The cadence is fixed and cannot be moved.** `GET /database/backups/schedule` returns
  **HTTP 402 `entitlement_required: backup.schedule` — Enterprise only** ✅. Backups land
  in a ~5-minute band around **10:27 UTC**. So the loss window is not "24 hours" in the
  abstract: it is *time since the last 10:27 UTC*. A failure at 10:26 UTC loses **23h59m**;
  a failure at 10:28 UTC loses about a minute. You do not get to choose which.
* **They contain the whole database, including `auth.users`.** Physical backups are a copy
  of the data directory, and Supabase's own clone documentation lists "Auth user data (user
  accounts, hashed passwords, and authentication records from the auth schema)" as carried.
  This is the single most important property of the backup and the one a repo rebuild can
  never have.
* **They do NOT contain Storage objects.** Supabase documents this explicitly: the database
  holds only metadata. Production has **1 bucket / 1 object** ✅ and nothing player-facing
  depends on it. *If that ever changes, Storage needs its own backup and this bullet must
  stop being true.*
* **They do NOT contain custom role passwords.** Supabase documents: *"daily backups do not
  store passwords for custom roles… you will need to reset their passwords after the
  restoration completes."* **This project has exactly TWO custom roles and exactly ONE of
  them has a password to lose** ✅ — the full enumeration and the copy-paste recovery are
  now §6a, which is the section to read before any restore. Short version:
  `hr_engine_login` (LOGIN, SCRAM-SHA-256, connlimit 20) is the identity the accrual Edge
  Function connects as; `hr_engine` is NOLOGIN and has **no password at all**, so it needs
  nothing reset. Miss the one that matters and every accrual fails after an otherwise
  perfect restore. See §6 gate 7 and §6a.

  > **Method note, because the obvious query gives the wrong answer.** `pg_roles.rolpassword`
  > returns the literal string `'********'` for *every* role including ones with no password,
  > so `rolpassword is not null` reports "password set" for `anon`, `authenticated` and
  > `hr_engine` alike — all false positives. The only honest source is **`pg_authid`**, which
  > returns `NULL` for `hr_engine` and `SCRAM-SHA-256$…` for `hr_engine_login` ✅. An earlier
  > revision of this document asserted "password set" from `pg_roles`; the conclusion happened
  > to be right for `hr_engine_login` and wrong for `hr_engine`. Use `pg_authid`.
* **Restore points / undo are NOT available on this project today.**
  `GET /database/backups/restore-point` returns **HTTP 400 "This endpoint is unavailable at
  the moment"** ✅. The API *has* `POST …/restore-point` and `POST …/undo`, which would make
  an in-place restore reversible — but they do not answer here. *Inference, not fact:* they
  are almost certainly gated behind PITR, since a restore point is a WAL construct. **Plan
  as if undo does not exist.** (This is a second, independent argument for §8.)

**Health assertion, numerically:** healthy = 7 or 8 `COMPLETED` backups present, newest
less than 26 hours old, zero `FAILED`, **and no gap larger than 26h between consecutive
`inserted_at` values** (the last clause is what actually proves the cadence — a count alone
cannot distinguish "one per day" from "eight taken in one week"). Measured 2026-08-15
10:30 UTC: **8 / 0 / newest 3h51m — healthy.** Re-measured 2026-08-15 20:55 UTC:
**8 / 0 / newest 10h29m, largest inter-backup gap 24h03m — healthy, cadence confirmed
daily across all 8** ✅.

---

## 2. A restore is schema + rows. The repo owns the schema; only a backup owns the rows.

### 2a. The schema half is proven, and it is proven by execution ✅

`tests/schema-drift.mjs` replays `supabase/schema.sql` + every migration in the order
declared by `tests/schema-apply-order.json` into a real PostgreSQL and fingerprints the
result. **Re-run 2026-08-15 20:5x UTC: green** ✅, at digest
**`f166dc74f8e0…`** — *not* the `df0fbe3178…` earlier revisions of this file pinned; twelve
migrations landed on 2026-08-15/16 and moved it. Current shape: **76 relations, 175
functions, 75 policies, 103 indexes, 15 triggers, 187 constraints, 447 columns, 67 RLS
states, 1 event trigger.**

**The live delta was re-measured for this revision, category by category, read-only** ✅ —
production returns **76 relations / 175 functions / 103 indexes / 75 public policies / 67
base tables**, matching the replay exactly in every category. `production_only` remains
**NONE**. (The baseline's own `known_production_delta.measured` still says 2026-08-14 and
its stated method is a fuller object-level set-difference than the count comparison done
here; counts agreeing is necessary, not sufficient. Treat the object-level delta as
**last proven 2026-08-14**.)

That guard's own header states what it does not cover, in point B:

> *"DATA. This proves the SCHEMA rebuilds. It says nothing about whether any row survives a
> restore."*

### 2b. The data half — `tests/restore-census.mjs`, new, executed ✅

Same replay engine, different question: **for every table, does a rebuild from this
repository reproduce production's rows, or does only a backup?**

```
$ node tests/restore-census.mjs
restore-census: OK — 66 tables classified, 8 scheduled job(s) reproduced by the chain
  seeded        21
  restore_only  36
  operational    8
  regenerated    1
```

> ⚠ **THE CENSUS IS RED AS OF 2026-08-15 20:5x UTC, and it is right to be** ✅:
>
> ```
> RESTORE CENSUS FAILED — what a rebuild gives back has changed.
>   · UNCLASSIFIED TABLE: public.hr_unlocks (61 row(s) after a rebuild).
> ```
>
> `hr_unlocks` arrived with `2026-08-16-unlocks.generated.sql` and holds **61 rows in
> production, 61 after a rebuild** ✅ — a **seeded** catalogue, no restore dependency. The
> guard fired exactly as designed: a new table shipped and nobody stated its DR class.
> **This is the single best evidence in the document that the guard works**, and it is also
> why the seeded count is now 22 and the table count 67. *Fixing the classification is a
> one-line edit to `tests/restore-census.baseline.json` and belongs to whoever ships the
> next migration — it is deliberately left RED here rather than silently green, because the
> census going red is the notification.*

**The good news is better than expected. All `seeded` tables rebuild to *exactly*
production's row count** — 21 at the time of the run below, **22 including `hr_unlocks`
(61 = 61 ✅, re-measured 2026-08-15 20:5x UTC)** — measured against live counts the same day:

| | rebuild | production | | | rebuild | production |
|---|---|---|---|---|---|---|
| `hr_items` | 426 | 426 ✓ | | `hr_activities` | 344 | 344 ✓ |
| `hr_item_slots` | 222 | 222 ✓ | | `hr_xp_table` | 99 | 99 ✓ |
| `hr_client_rpc_baseline` | 51 | 51 ✓ | | `hr_castle_items` | 34 | 34 ✓ |
| `hr_skills` | 15 | 15 ✓ | | `hr_equip_slots` | 15 | 15 ✓ |
| `hr_crops` | 9 | 9 ✓ | | `hr_castle_board_tasks` | 9 | 9 ✓ |
| `hr_hunt_bosses` | 6 | 6 ✓ | | `hr_castle_buildings` / `_tiers` / `hr_hunt_tiers` | 5 | 5 ✓ |
| `hr_start_inventory` | 3 | 3 ✓ | | `hr_start_kit` / `_equipment` / `_skill_xp` | 1 | 1 ✓ |
| `hr_catalogue_meta` | 1 | 1 ✓ | | `hr_ledger_config` | 1 | 1 ✓ |
| `leaderboard_meta` | 1 | 1 ✓ | | | | |

**Consequence for the drill: a restore never has to carry catalogues, functions, policies,
indexes or grants. It only has to carry rows.** That is what makes the whole operation
small.

**Retention survives a rebuild too** — the chain reschedules 8 of production's 9 pg_cron
jobs, pinned by name, schedule *and* command. The 9th, `hearthrise-leaderboards`, is
present in production and *is* scheduled by the chain on a real Postgres; the PGlite replay
cannot observe it because `2026-08-08-leaderboards.sql` is the only file that opens its cron
block with `create extension if not exists pg_cron`, whose failure handler `return`s out of
the whole block. **Proven by execution, not by reading:** replaying with that one line
elided produces the job; replaying unchanged does not. It is therefore a stand-in artefact,
not a hole — and it is deliberately excluded from the guard's `expected` list, because a
guard must not assert what it cannot observe. **Verify the ninth by hand after any rebuild
(§6 gate 5).**

### 2c. What a repo rebuild does NOT give back

**36 tables come back empty.** Re-derived from live counts on 2026-08-15, not taken from
any prior document — and the brief's "known set" was close but not exact
(`bug_reports` is **27**, not 21; `reltuples` said 21).

**Group A — matters post-cutover. These are the reason this runbook exists.**

Counts below **re-measured 2026-08-15 20:5x UTC** ✅. The `prev` column is the figure the
previous revision recorded the same morning — every progression table moved, which is the
point.

| Table | prev | prod rows now | Why a backup is the only copy |
|---|---|---|---|
| `player_state` | 0 | **2** | Gold, gems, hearth tokens, hp, the activity pointer, `version`. After cutover there is no second copy anywhere in the world. |
| `player_skills` | 0 | **30** | XP per skill — the value every level and every leaderboard score is derived from. |
| `player_inventory` | 0 | **11** | One row per item; the bank cap is `count(*)` over it. |
| `player_equipment` | 0 | **2** | |
| `player_farm` | 0 | **8** | |
| `player_progress` | 0 | **3** | Quests, dailies, bounties, stats, collections, flags. Pruned at 31 days, but only rows with a non-empty `period_key` — permanent progress is never pruned. |
| `player_ledger` | 3 | **29** | Progression **and** the audit trail. See the trap below. |
| `profiles` | 8 | 8 | Identity, not progression. Losing it makes every player `Adventurer`. |
| `display_names` | 6 | **7** | The uniqueness ledger. Losing it frees every claimed name for a stranger to take — **unrecoverable once taken**. |

> **The `player_ledger` trap, and it is not obvious.** Every daily cap is read by *summing
> this table* — `hr_day_budget_used` sums `gold_in`/`xp_in`/`qty_in` over the day's rows
> rather than reading a counter (by design; a counter is a value something can move).
> **Restoring `player_state` without `player_ledger` therefore silently resets every
> player's daily gold/XP/item ceiling to zero-used**, handing out a second full day of
> budget on top of whatever was already minted. Restore the two together or not at all.

**Group B — wiped at cutover, so pre-cutover loss costs a beta and post-cutover it costs
nothing.**

`game_saves` (6) · `market_listings` (1) · `market_sales` (6) · `market_buy_offers` (0) ·
`chat_messages` (8) · `clans` (2) · `clan_members` (5) · `clan_ledger` (8) ·
`clan_board` (21) · `clan_stores` (2) · `clan_raids` (3) · `clan_order_ballots` (5) ·
`clan_order_votes` (2) · `clan_work_orders` (1) · `clan_bans`/`clan_invites`/
`clan_tavern`/`clan_withdrawals`/`clan_work_labour` (0) · `raid_contributions` (6) ·
`raid_claims` (0) · `world_event_joins` (14) · `world_event_pledges` (14) ·
`world_event_totals` (7)

`game_saves` is the interesting one: **6 rows / 464 kB that are every player's entire save
today and are worth exactly nothing the moment the cutover completes** — server-authority
§2a-iv is explicit that `game_saves.snapshot` is never read, because seeding from it would
launder the forged values the audit found. It is the only table in the system whose value
flips from critical to worthless at a known instant.

> ✅ **DECIDED — TYLER, 2026-08-15: "the cutover will wipe clans."** The wipe is TOTAL:
> players, clans, raids, world-event state, no carve-outs. This document's assumption is
> now a ruling. The argument for sparing the clan surface (it was server-authoritative from
> the start and never exploitable) was considered and declined — clan standing derives from
> contributions earned in the wiped client-authored economy, so a surviving clan ledger
> would rank round-2 clans by round-1 exploit-era wealth. Every table in Group B is
> disposable at cutover; nothing in this runbook needs a carve-out path.

**Group C — `operational`, 8 tables. Losing them costs observability history, never player
value.** Re-measured 2026-08-15 20:5x UTC ✅: `game_events` (**5,174**) · `maintenance_log`
(**112**) · `hr_rate_counters` (**145**) · `maintenance_alerts` (13) · `hr_rejections`
(**2**) · `player_intents` (**22**) · `player_ledger_rollup` (0) · `session_claims` (**6**).

> **`hr_rate_counters` is `UNLOGGED`, and that has a restore consequence worth one line.**
> An unlogged table's contents are not WAL-logged, so a **physical restore or PITR brings it
> back EMPTY regardless of what it held** — this is not a bug and needs no remediation. The
> effect is that every player starts the restored database with a fresh rate-limit window.
> For a spam brake that is the correct failure direction, and it is *why* the table was made
> unlogged. Do not "fix" it by making it logged: it is a hot upsert on a per-user row and
> logging it would put the rate limiter in the WAL path of every RPC.
>
> Its growth is also **bounded, not append-only** — `primary key (user_id, bucket)` with an
> `on conflict … do update` that reuses the row and slides `window_start`, so the ceiling is
> *users × distinct buckets*, roughly **18 rows per user** at today's bucket list (145 rows /
> 8 users ✅). At 600 players that is ~11k rows / ~2 MB. **No prune is needed and none should
> be added.** The only unbounded edge is rows belonging to deleted users, which the
> `auth.users` cascade does not cover — negligible, noted for completeness.

**Group D — `regenerated`, exactly one table, and it is the one a count would lie about.**

`hr_server_secrets` rebuilds to **1 row with a different value**:
`2026-08-11-player-state.sql` seeds it with
`sha256(gen_random_uuid() || gen_random_uuid() || clock_timestamp())`, so the 256-bit PRNG
secret is *fresh on every apply*. A census that only counted rows would report this table as
reconstructed. What actually changes if the value moves:

1. `hr_seed`'s accrual PRNG re-rolls, so **a disputed drop can no longer be replayed
   deterministically from `player_ledger`** — which is the stated reason the seed is
   deterministic at all.
2. The accrual idempotency key `hr_seed(user, slot, 'intent:accrue:<watermark>')` moves, so
   an accrual retried across the boundary is no longer deduplicated and can pay twice.
   Bounded — `accrued_to` is restored with it and `hr_apply` re-validates against the
   restored watermark — but real.

Neither is fatal; both are silent. **A restore from a backup keeps the real value. Only a
repo rebuild re-rolls it.** Which is precisely why "we can rebuild from the repo" is not a
disaster recovery plan.

### 2d. And the one that is not in `public` at all

**`auth.users` — 8 rows, created by NO file in this repository.** ✅

17 foreign keys in `public` reference it, 12 of them `ON DELETE CASCADE`:
`beta_invites.used_by`, `bug_reports.user_id`, `chat_blocks.blocker_id`,
`chat_blocks.blocked_id`, `clan_bans.user_id`, `clan_invites.user_id`,
`clan_invites.invited_by`, `clan_members.user_id`, `clans.created_by`,
`display_names.user_id`, `game_events.user_id`, `game_saves.user_id`,
`market_buy_offers.buyer_user_id`, `market_listings.seller_user_id`,
`player_state.user_id`, `profiles.id`, `session_claims.user_id`.

If `auth.users` is empty, the player rows **cannot even be INSERTed back**, and every player
has lost their account and their login. The replay's `auth.users` comes from
`tests/sql/pglite-fixture.sql` — a test fixture — which is why the census deliberately does
not assert against it: asserting against a fixture proves nothing.

**`auth.users` is carried by a Supabase backup restore and by nothing else we own.** It is
the single strongest argument in this document for the backup being real.

---

## 3. The four things a restore must carry that nothing else can

Everything above collapses to this list. If a recovery gets these four back, the rest is
`git` and a redeploy.

1. **`auth.users` + `auth.identities`** — every player's account. No repo, no export.
2. **The `player_*` progression tables, restored as a set** — `state`, `skills`,
   `inventory`, `equipment`, `farm`, `progress`, **and `ledger` together** (§2c trap).
3. **`profiles` + `display_names`** — identity and the name-uniqueness ledger.
4. **`hr_server_secrets`** — the PRNG/idempotency secret whose value a rebuild silently
   re-rolls.

---

## 4. THE DRILL — production is gone at 3am

### 4a. Stop. Classify the failure first.

The most expensive mistake available is restoring when you did not need to. A restore is
**destructive** and, on this project today, **not undoable** (§1). Three failure shapes,
three different answers:

| What you are looking at | Do NOT restore | Do this |
|---|---|---|
| Project unreachable, dashboard down, `ACTIVE_HEALTHY` false | ✔ | Supabase-side outage. Check status. Restoring makes it worse and loses data the outage did not. |
| Schema is wrong / a migration went bad / an object is missing | ✔ | Roll the migration forward. Every migration in this repo states its rollback. The schema is reproducible from git (§2a); the rows are not. **Never restore to fix a schema problem.** |
| Rows are gone, corrupted, or a destructive statement ran | | Restore. Continue to 4b. |

**Before touching anything, capture the evidence** — read-only, 30 seconds, and it is the
only chance to know what you lost:

```bash
export SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase-token)"
export PROJECT_REF=nezapsylztqbbwuwembx

curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/backups" | tee /tmp/backups-at-incident.json
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF" | tee /tmp/project-at-incident.json

# Per-service health — this is what tells you it is an outage and not a data loss.
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/health?services=db&services=auth&services=rest&services=storage"
# healthy baseline, measured 2026-08-15: db / auth (GoTrue v2.195.0) / rest / storage
#   all {"healthy":true,"status":"ACTIVE_HEALTHY"}

# Disk, because "the database is broken" is sometimes "the disk is full".
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/disk/util"
# healthy baseline, measured 2026-08-15: 445,685,760 used of 2,077,073,408 (21.5%)
```

…then the row census, so "what did we lose" is a diff and not a memory. The exact statement
is in `tests/restore-census.baseline.json` → `production.how_to_remeasure`.

### 4b. Choose the mechanism

Two exist on Pro with physical backups. They are **not** equivalent and the choice is the
whole risk decision.

| | **A — In-place restore** | **B — Restore to a New Project** |
|---|---|---|
| What it does | Rewinds *this* project to a chosen backup | Creates a *new* project from the backup; source untouched |
| Interface | **Management API** — `POST /v1/projects/{ref}/database/backups/restore` with `{"id": <backup id>}` ✅ *(endpoint verified present in the API spec; never invoked)* | **Dashboard only.** No clone/restore-to-new-project endpoint exists in the Management API spec ✅ — this is a verified absence, not an assumption |
| Source project | **Destroyed and replaced.** Anything written since the backup is gone | **Untouched.** This is the property that matters |
| Undo | **Not available today** (§1) | N/A — the original still exists |
| Project ref | unchanged | **CHANGES** → §5 |
| Carries `auth.users` | yes | yes (documented explicitly) |
| Carries Storage objects | no | **no** — and the docs call this out separately |
| Carries Edge Functions | yes (they are not in the DB; they stay deployed) | **no — must be redeployed** |
| Downtime | project inaccessible during the restore | source stays up the whole time |
| Status | Beta feature (Supabase's own label) | Beta feature |

> **DEFAULT TO B.** Mechanism A is the only one that can make a bad situation worse: it
> overwrites the evidence, it is not undoable here, and if the backup turns out to be
> unusable you have destroyed the only other copy. B costs a second project's monthly bill
> and an hour of reconfiguration, and it keeps the original for as long as you want it.
> Use A only when the source project is *already* known-worthless and downtime is the
> dominant cost.
>
> **One-way restriction on B, worth knowing before you need it:** Supabase documents that a
> project created by restore **cannot itself be used as a clone source**. If you cut over to
> the restored project, you lose the restore-to-new-project capability on it (daily backups
> keep running; only cloning is unavailable). Plan the second restore before you need it.

### 4c. Mechanism A — in-place restore  **NOT EXECUTED**

```bash
# 1. Pick the backup. Newest COMPLETED one BEFORE the damage.
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/backups"

# 2. ⚠ DESTRUCTIVE — REQUIRES EXPLICIT HUMAN AUTHORISATION EVERY TIME.
#    This DELETES every row written since that backup was taken. State the
#    window out loud, get a yes, then run it.
curl -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/backups/restore" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": <BACKUP_ID>}'

# 3. Poll until healthy.
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF" | grep -o '"status":"[^"]*"'

# 4. Reset the custom role password — MANDATORY, see §6 gate 7.
# 5. Run every gate in §6.
```

Rollback at each stage: **step 2 has none.** That is the whole reason B is the default.

### 4d. Mechanism B — restore to a new project  **NOT EXECUTED**

Dashboard-only. Tyler's hands (§7).

1. Dashboard → source project → **Database → Backups → Restore to a New Project**.
2. Select a backup. Confirm the cost estimate (the new project mirrors compute, disk and
   network settings; on Micro that is roughly the source's own bill again).
3. Wait. Supabase creates the project and restores into it. **RTO estimate at 20 MB: 15–30
   minutes, dominated by project provisioning, not by data volume — UNMEASURED.**
4. **Immediately disable outbound-acting extensions on the clone.** Supabase documents this
   and for us it is not optional: the clone comes up with all **9 pg_cron jobs armed** and
   will start pruning ledgers, trimming events and running the grant-hygiene detector
   against a database nobody has verified yet. Do this *first*, before any verification:

   ```sql
   -- On the CLONE only. Reversible: cron.schedule re-arms by name.
   select cron.unschedule(jobname) from cron.job;
   select count(*) as should_be_zero from cron.job;
   ```
   Re-arm them (§6 gate 5) only once the clone is verified and you have decided it is the
   new production.
5. Run every gate in §6 **against the clone**, while the original is still up. This is the
   moment B pays for itself: you get to find out whether the backup was any good *before*
   committing to it.
6. Only then cut traffic over (§5).

Rollback: **at every step up to 6, do nothing — the original project is still live.** After
6, rollback is pointing the client back at the original ref.

---

## 5. What changes when the project ref changes (mechanism B only)

The new project has a new ref, a new URL, and **new API keys**. Everything below is a repo
change plus a redeploy; nothing here is lost, only re-pointed.

| # | What | Where | Note |
|---|---|---|---|
| 1 | Project URL | `src/net/supabase-bootstrap.js:52` `url: 'https://<ref>.supabase.co'` | Ships to browsers — needs a cache-buster bump (`./bump-version.sh <NNN>`) or players run the old ref for ~10 min |
| 2 | anon key | `src/net/supabase-bootstrap.js:53` | New project ⇒ new key. Never paste a service-role key here |
| 3 | CLI project id | `supabase/config.toml:30` `project_id` | Needed before `supabase functions deploy` |
| 4 | Edge Functions | redeploy **both**: `hr-accrue` (**v22**, was v12 this morning — it ships several times a day) and `bug-report-bridge` (v4) ✅ re-verified 2026-08-15 20:5x UTC | Code is in the repo. Pack with `tools/pack-edge.mjs` — do **not** hand-edit the `?v=` rule |
| 5 | `HR_ENGINE_DB_URL` | Edge Function secret | Embeds host **and** the `hr_engine_login` password. Both change. Pooler port **6543**, never 5432 (design §2a-ii — `max_connections` is 60 and an unpooled driver exhausts it). **Full procedure: §6a-iii step 2** |
| 6 | `DISCORD_WEBHOOK_URL` | Edge Function secret (`bug-report-bridge`) | Re-set; value lives at `~/.hearthrise/`, never in the repo |
| 7 | `hr_engine_login` password | `alter role hr_engine_login password '<new>'` | Must match #5 exactly. **§6a.** `hr_engine` needs nothing — it has no password ✅ |
| 8 | MCP / local tooling | `.mcp.json` | Developer convenience only |
| 9 | Documentation refs | `tests/schema-drift.baseline.json` → `known_production_delta.project`; comment at `supabase/functions/hr-accrue/jwt.js:53` | Cosmetic — but a stale ref in a DR doc is how the *next* incident goes wrong |

**Does NOT need changing** ✅: the JWT verifier. `SUPABASE_URL` is platform-injected and
`index.ts:127-131` derives `JWKS_URL` and `ISSUER` from it, so identity verification
self-heals on the new project. That is a real property of the §2a-i design paying off, and
it is worth knowing at 3am so nobody goes looking for a hardcoded issuer that is not there.

**Auth settings are NOT carried** (documented): providers, redirect URLs, email templates,
rate limits. Re-check them before letting players in.

---

## 6. Verification gates — a restore is not done until all eight pass

Run against whichever database you intend to make production. **Fail any gate ⇒ do not cut
over.** All read-only except gate 7.

**Gate 1 — the schema is the schema.** `node tests/schema-drift.mjs` → must print the
digest **currently committed in `tests/schema-drift.baseline.json`**. As of 2026-08-15 that
is **`f166dc74f8e0…`** ✅ — but *read it from the baseline, do not trust this line*: the
digest moved twice today and a runbook that hardcodes it will be wrong again by the next
migration. Then re-measure the live delta with the queries in
`tests/schema-drift.baseline.json` → `how_to_remeasure`; expect `production_only: NONE`.

**Gate 2 — the catalogues are the catalogues.** Compare against
`tests/restore-census.baseline.json` → `tables[*].replay`:
```sql
select 'hr_items' t, count(*) n from hr_items union all
select 'hr_activities', count(*) from hr_activities union all
select 'hr_item_slots', count(*) from hr_item_slots union all
select 'hr_xp_table', count(*) from hr_xp_table union all
select 'hr_castle_items', count(*) from hr_castle_items union all
select 'hr_client_rpc_baseline', count(*) from hr_client_rpc_baseline union all
select 'hr_unlocks', count(*) from hr_unlocks order by 1;
-- expect 426 / 344 / 222 / 99 / 34 / 51 / 61   (re-verified 2026-08-15 20:5x UTC ✅)
```
> `hr_client_rpc_baseline` is a trap for anyone spot-checking with `reltuples`: the planner
> estimate reads **66** while `count(*)` is **51** ✅, because rows were deleted and `analyze`
> has not run. **Every count in this document is `count(*)`.** Never verify a restore with
> `reltuples`.

**Gate 3 — the players exist.** `select count(*) from auth.users;` → **8** ✅ (re-verified
2026-08-15 20:5x UTC), or whatever the last census recorded. **Zero here means the restore
did not carry auth and everything else is moot.**

**Gate 4 — progression came back as a set.** Every `player_*` count matches the census, and
`player_ledger` is non-empty whenever `player_state` is (§2c trap):
```sql
select 'state' t, count(*) n from player_state union all
select 'skills', count(*) from player_skills union all
select 'inventory', count(*) from player_inventory union all
select 'equipment', count(*) from player_equipment union all
select 'farm', count(*) from player_farm union all
select 'progress', count(*) from player_progress union all
select 'ledger', count(*) from player_ledger order by 1;
```

**Gate 5 — retention is armed.** `select jobname, schedule from cron.job order by 1;` →
**exactly 9**, matching `tests/restore-census.baseline.json` → `cron.expected` **plus
`hearthrise-leaderboards`** (the one the replay structurally cannot see — §2b). A database
that comes back without `trim-game-events` regrows `game_events` without bound; that table
reached **1,598,269 rows / 229 MB — 94% of a 244 MB database — in four days** the last time
nothing was watching.

**Gate 5 note — verified running, not merely present.** All **9** jobs are scheduled,
`active = true`, and **every one succeeded within the last 48h with zero failures** ✅
(`cron.job_run_details`, measured 2026-08-15 20:5x UTC: leaderboards 576 runs, cron-health
48, ledger-prune 48, intents-prune 48, grant-hygiene/progress-prune/rejections-prune/
trim-chat/trim-game-events 2 each). `hr-cron-health` has raised **0 alerts** on each of its
last 12 hourly runs ✅. Presence is the gate; this is the evidence the machinery actually
fires. Re-run the same query after a restore — a job can be present and disarmed.

**Gate 6 — grants and RLS survived.** `select public.hr_assert_grant_hygiene(true);` — the
project's own nightly detector, and a stronger check than any fingerprint. Then confirm
`hr_engine` still holds zero table privileges:
```sql
select count(*) as must_be_zero from information_schema.role_table_grants where grantee='hr_engine';
```
✅ **Verified 0 on 2026-08-15 20:5x UTC**, after b353 revoked the two grants the nightly
detector raised on. The engine's entire authority is `usage` on `public` plus `execute` on
**10 allowlisted functions** — enumerated in §6a.

**Gate 7 — the engine can actually connect. ⚠ THE ONE EVERYONE WILL FORGET.** *(the only
gate that writes)*

Supabase does not restore custom role passwords. `hr_engine_login` is a custom role. **The
complete, copy-paste-runnable recovery — including the `HR_ENGINE_DB_URL` re-set — is §6a.**
Do not improvise it from this gate; the port is the part people get wrong.

**A restore that passes gates 1–6 and fails this one looks completely healthy and pays
nobody.**

**Gate 8 — a real player round-trip.** Sign in as a test account, load a character, run one
accrual, confirm the ledger row lands and `version` bumps. Nothing above proves the game
works; only this does.

---

## 6a. The custom-role gap — the complete recovery ⚠

**This is the known hole in every restore path and the most likely cause of a restore that
looks perfect and pays nobody.** Enumerated live 2026-08-15 20:5x UTC ✅.

### 6a-i. What exists, exactly

Two custom roles. Nothing else in this cluster is ours — every other role is a Supabase
platform role and the platform restores its own.

| | `hr_engine` | `hr_engine_login` |
|---|---|---|
| Purpose | The **capability**. Holds the grants. | The **identity**. The thing that connects. |
| `rolcanlogin` | **false** | **true** |
| `rolinherit` | **false** (NOINHERIT) | **false** (NOINHERIT) |
| `rolconnlimit` | `-1` | **20** |
| `rolbypassrls` / `rolsuper` / `rolcreaterole` / `rolcreatedb` / `rolreplication` | all false | all false |
| `rolvaliduntil` | null | null |
| `rolconfig` | null | null |
| Member of | — | **`hr_engine`** |
| Members | `hr_engine_login`, `postgres` | `postgres` |
| **Password (`pg_authid`)** | **NONE — `rolpassword is null`** ✅ | **SCRAM-SHA-256** ✅ |
| **Lost by a restore?** | **No.** Nothing to lose. | **YES — the password, and only the password.** |

**`rolinherit = false` on both is load-bearing, not incidental.** `hr_engine_login` is a
member of `hr_engine` but does **not** automatically hold its privileges — the engine's
session must `set role` explicitly. Recreate either role with the default `INHERIT` and the
privilege model silently changes shape. Every `create role` below therefore says `NOINHERIT`.

### 6a-ii. What the roles hold — the complete grant surface

`hr_engine` holds **zero table privileges** ✅ (gate 6). Its entire authority is:

* `grant usage on schema public to hr_engine;`
* `execute` on exactly **10** functions ✅ — `hr_apply(uuid,int,bigint,uuid,jsonb)`,
  `hr_claim_lookup(uuid,int,text,text)`, `hr_level_from_xp(bigint)`,
  `hr_offline_cap_ms(uuid,int)`, `hr_perks_of(uuid,int)`, `hr_rate_gate(uuid,int,text)`,
  `hr_seed(uuid,int,text)`, `hr_state_of(uuid,int)`, `hr_total_level(uuid,int)`,
  `hr_xp_for_level(int)`.

`hr_engine_login` holds **no grants of its own at all** — everything it can do, it does by
`set role hr_engine`.

> **A physical restore CARRIES the roles, the memberships and the grants.** They are cluster
> catalog data. **Only the password is dropped.** So in the overwhelmingly likely case,
> §6a-iii step 1 is the *only* step you need and steps 2–3 are a no-op that costs nothing to
> run. §6a-iv exists for the other case — a repo rebuild, where the roles come back from the
> migration chain but you should verify rather than assume.

### 6a-iii. The recovery — run in this order

**Step 1 — reset the password.** Generate it first; never type one you invent.

```bash
# Generate a strong password with no shell-hostile or URL-hostile characters.
# (Percent-encoding a password inside a connection URL is the second-most-common way
#  this step goes wrong. Avoiding the characters entirely is cheaper than escaping them.)
NEW_PW="$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40)"
echo "$NEW_PW"    # copy it — you need it twice and it is not readable back afterwards
```

```sql
-- On the restored database, as postgres.
alter role hr_engine_login with login noinherit connection limit 20 password '<NEW_PW>';

-- Verify the SHAPE survived the restore, from pg_authid (NOT pg_roles — see §1).
select rolname, rolcanlogin, rolinherit, rolconnlimit,
       (rolpassword is not null) as has_password,
       left(rolpassword, 14) as method
  from pg_authid where rolname = 'hr_engine_login';
--   expect  hr_engine_login | t | f | 20 | t | SCRAM-SHA-256$

-- Verify the MEMBERSHIP survived (the grants are useless without it).
select r.rolname as member, b.rolname as member_of
  from pg_auth_members m
  join pg_roles r on r.oid = m.member
  join pg_roles b on b.oid = m.roleid
 where r.rolname = 'hr_engine_login';
--   expect  hr_engine_login | hr_engine
```

**Step 2 — rebuild `HR_ENGINE_DB_URL` and re-set the secret. ⚠ PORT 6543, NEVER 5432.**

The value embeds the host **and** the password, so it changes whenever either does. Get the
host from the API rather than typing it — a restored-to-new project gets a **new pooler
host**, and this is precisely where the port rule gets broken by copy-paste.

```bash
export SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase-token)"
export PROJECT_REF=<ref>          # unchanged for mechanism A; the NEW ref for mechanism B

# Read the pooler host/port from the platform. Confirm db_port is 6543 before continuing.
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/database/pooler"
# verified 2026-08-15 ✅:
#   db_host "aws-1-us-west-2.pooler.supabase.com" · db_port 6543 · pool_mode "transaction"
#   db_user "postgres.<ref>" · is_using_scram_auth true

# The username is the CUSTOM role qualified by the project ref — NOT "postgres.<ref>".
# Supavisor routes on the tenant AFTER the dot and authenticates the role BEFORE it.
#
# ⚠ INFERRED, NOT VERIFIED. This shape mirrors the `postgres.<ref>` the pooler API returns
#    for the default role, and it is the only shape consistent with how Supavisor routes.
#    But the live secret's value is deliberately unreadable, so I could NOT confirm that the
#    working production string uses it. VERIFY IT WITH THE CONNECT TEST BELOW BEFORE relying
#    on it at 3am — do not discover the answer during an incident.
HR_ENGINE_DB_URL="postgresql://hr_engine_login.${PROJECT_REF}:${NEW_PW}@aws-1-us-west-2.pooler.supabase.com:6543/postgres"

# FAIL-CLOSED CHECK — the same regex the Edge Function applies at module load.
echo "$HR_ENGINE_DB_URL" | grep -qE ':6543(/|\?|$)' \
  && echo "port OK" || { echo "REFUSING: not the transaction pooler"; false; }

# CONNECT TEST — prove the string before you commit it to a secret. Costs one connection.
# This is also the cheapest way to settle the username-shape question above, and it can be
# run on production TODAY (read-only, one round trip) to retire the ⚠ before an incident.
psql "$HR_ENGINE_DB_URL" -c "select current_user, inet_server_port();"
#   expect  hr_engine_login | 6543
#   'Tenant not found'        → the .<ref> suffix is wrong
#   'password authentication' → step 1's password and this string disagree

supabase secrets set --project-ref "$PROJECT_REF" HR_ENGINE_DB_URL="$HR_ENGINE_DB_URL"

# Confirm the name is present (values are never readable back — by design).
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/secrets"
# expect HR_ENGINE_DB_URL and DISCORD_WEBHOOK_URL among the names ✅ (both present 2026-08-15)
```

> **Why the port rule is enforced in three places and should stay that way.**
> `hr-accrue/index.ts:104` computes `POOLER_OK = /:6543(\/|\?|$)/.test(DB_URL)` at **module
> load**, and when it fails the pool is never constructed and every request answers
> `engine_unconfigured` ✅. That is deliberate: a session-mode (5432) connection string works
> fine in testing and only fails when the project is busy — at which point it exhausts
> `max_connections = 60` and takes the **dashboard** down with it, i.e. it breaks the tool
> you would use to fix it. **A restore is the single most likely moment for this string to
> be rebuilt by hand.** Fail-closed is the correct behaviour; do not "temporarily" relax it.

**Step 3 — redeploy the functions (mechanism B only) and prove the round trip.**

```bash
# Mechanism B only: a new project has no functions. Code is in the repo.
# Pack first — do NOT hand-edit the ?v= rule (CLAUDE.md, b332).
node tools/pack-edge.mjs
supabase functions deploy hr-accrue        --project-ref "$PROJECT_REF"
supabase functions deploy bug-report-bridge --project-ref "$PROJECT_REF"
```

Then **gate 8**: call `hr-accrue` once with a real player token and confirm a `player_ledger`
row lands and `player_state.version` bumps. An `engine_unconfigured` response means step 2
is wrong — almost always the port or the username shape.

### 6a-iv. If the roles are missing entirely (repo-rebuild path only)

Idempotent, additive, safe to run when they already exist. **Rollback:** `drop role` — but
note that dropping `hr_engine` requires its grants be revoked first, and dropping either role
while the Edge Function is live takes accrual down; do it only on a database not serving
traffic.

```sql
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    create role hr_engine nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine_login') then
    create role hr_engine_login login noinherit connection limit 20;
  end if;
end $$;

grant hr_engine to hr_engine_login;
grant usage on schema public to hr_engine;

grant execute on function public.hr_apply(uuid,int,bigint,uuid,jsonb)  to hr_engine;
grant execute on function public.hr_claim_lookup(uuid,int,text,text)   to hr_engine;
grant execute on function public.hr_level_from_xp(bigint)              to hr_engine;
grant execute on function public.hr_offline_cap_ms(uuid,int)           to hr_engine;
grant execute on function public.hr_perks_of(uuid,int)                 to hr_engine;
grant execute on function public.hr_rate_gate(uuid,int,text)           to hr_engine;
grant execute on function public.hr_seed(uuid,int,text)                to hr_engine;
grant execute on function public.hr_state_of(uuid,int)                 to hr_engine;
grant execute on function public.hr_total_level(uuid,int)              to hr_engine;
grant execute on function public.hr_xp_for_level(int)                  to hr_engine;

-- Then §6a-iii step 1 to set the password, and gate 6 to confirm zero table privileges.
```

**Then re-run gate 6** (`hr_assert_grant_hygiene`) — it is the authority on this surface and
will catch anything the block above got wrong or left over.

---

## 7. What Tyler personally must click — and nothing more

I have been strict here. Everything the Management API can do is listed as a command, not
as a click.

| # | Action | Why it cannot be automated |
|---|---|---|
| 1 | **Restore to a New Project** (dashboard → Database → Backups → Restore to a New Project) | **Verified absence, and audited rather than assumed:** the Management API spec was fetched (`https://api.supabase.com/api/v1-json`, **115 paths**) and searched for `clone` / `duplicate` / `restore-to-new` / `new_project` across every path *and* every operation body — **zero hits** ✅. The 94 `/v1/projects/{ref}/…` sub-paths were then listed and read by eye. The backup endpoints that exist are `GET backups`, `POST backups/restore`, `POST backups/restore-pitr`, `GET,POST backups/restore-point`, `GET,PATCH backups/schedule`, `POST backups/undo` — and none of them creates a project. Dashboard-only, full stop. |
| 2 | **Approve the cost estimate** on that screen | It creates a billable project. Financial consent is his, never inferred. |
| 3 | **Enable PITR** — *if he decides yes* (§8) | Technically `PATCH /v1/projects/{ref}/billing/addons` with `{"addon_type":"pitr","addon_variant":"pitr_7"}` ✅ would do it, and the Small compute upgrade the same way. **I am listing it as his action anyway because it is a recurring charge, not because the API cannot.** Say the word and it is one command. |
| 4 | **Authorise any destructive step, out loud, every time** | Mechanism A's restore, any truncate, any wipe. Stated loss → explicit yes → act. Never inferred from context or from a previous approval. |
| 5 | **Set the Edge Function secrets** on a new project (`HR_ENGINE_DB_URL`, `DISCORD_WEBHOOK_URL`) | Their values are deliberately not readable by tooling and are not in the repo. |

**Not on this list, because the API does them:** listing backups, checking project health,
in-place restore, PITR restore, measuring anything, redeploying Edge Functions, running
every gate in §6.

---

## 8. The PITR decision, priced

**Verified from this organisation's own billing API on 2026-08-15, and re-verified 20:5x UTC
the same day** ✅ — not from a docs page: PITR is offered at **7 days = $100/month**, 14 days
= $200/month, 28 days = $400/month, and `selected_addons` is still **empty** ✅ (no PITR, no
compute add-on). The same response prices compute: **Micro $0.01344/h (~$10/mo)** — what the
project runs on today, matching the `max_connections = 60` measured on the database ✅ — and
**Small $0.0206/h (~$15/mo)**. Supabase documents that PITR requires **at least Small**, so
the true incremental cost is **$100 + the $5/month Micro→Small step = ~$105/month** (Pro's
$10 monthly compute credit already offsets Micro; *the credit is documented behaviour, not
something I verified on this account*). Enabling PITR **replaces daily backups rather than
adding to them**, so there is no double charge and the 7-day window is the same span you
have now.

**The recommendation, in one paragraph.** Today PITR is **not worth $100/month and I am not
going to upsell it**: the database is a *cache* of client-authored saves — every player's
browser holds their own copy, `game_saves` is 6 rows / 464 kB, and losing a day of it costs
a beta that is scheduled to be deleted anyway. The moment the cutover completes that
argument inverts completely and there is no gradual middle: the server becomes the sole
record of every player's progression, `game_saves` becomes worthless, and the accepted loss
window goes from "a day of a disposable beta" to **"up to 23 hours 59 minutes of every
living player's real progress, with no client copy to reconcile from"** — and because the
backup window is fixed at ~10:27 UTC and cannot be moved on Pro (HTTP 402, Enterprise-only
✅), you do not even get to choose how bad that is. PITR takes that from ~24 hours to a
**worst-case RPO of about 2 minutes** (Supabase archives WAL on a 2-minute interval, sooner
under load), and it is the only thing that does. It also buys a second, less obvious thing
this project currently lacks: **restore points and undo** — the endpoints exist in the API
but answer HTTP 400 here (§1), which almost certainly means they arrive with PITR, and they
are what makes an in-place restore reversible instead of a one-way door. **So: switch PITR-7
on as part of the cutover checklist — after the restore drill in §9 has been rehearsed and
before the first real player progression is written to `player_state` — and not a day
earlier.** ~$105/month against "every player loses everything and we have no recovery path"
is not a close call once the sole-record property is live; against a beta with a client-side
copy, it is ~$105/month for nothing. One number to hold onto: **~$105/month is roughly
$3.45/day, and the thing it prevents is losing a day.**

> **The trigger is closer than it was this morning.** `player_state` is no longer empty — 2
> rows, 29 ledger rows, 30 skill rows ✅. Those are test-generated and still disposable, so
> the recommendation does **not** change today. But the condition this paragraph defers to
> ("before the first real player progression") is no longer months away; it is the cutover
> itself, and the cutover is the nearest gate in this document. **Decide PITR before the
> wipe-and-launch, not after** — after is when it is already too late to have protected the
> first day.

---

## 9. The rehearsal — how to prove any of this, safely  **NOT EXECUTED**

**This is the item that closes the durability blocker. Everything above is a plan until it
runs once.** It is deliberately designed to touch production zero times.

**Cost — priced from the billing API, and it is the most surprising number in this
document.** Mechanism B mirrors the source's compute, and the source is **Micro at
$0.01344/hour** ✅. A clone alive for **three hours costs about four cents** ($0.040), plus a
prorated slice of 2 GB of gp3 disk — call the whole drill **well under $1**. The organisation
is already on Pro, so there is no second subscription fee; the marginal cost is compute-hours
and disk only.

> **This reframes the entire durability blocker.** The reason no restore has ever been tested
> was implicitly assumed to be cost. It is not — it is **~$0.04 and one dashboard click**.
> The only real inputs are Tyler's approval and 60–90 minutes of mostly-waiting. *Confirm the
> figure on the cost-estimate screen before approving (§7 item 2) — the API prices compute,
> not the clone flow's own estimate, and the screen is authoritative.*

**Estimated wall-clock:** 60–90 minutes, most of it waiting. **UNMEASURED — the first run
is what produces the real RTO, and recording it is the point.**

1. **Pre-flight (no cost).** `node tests/schema-drift.mjs` and `node tests/restore-census.mjs`
   both green. Re-measure production counts (`how_to_remeasure`) so the drill has a target
   to diff against. ✅ *schema-drift green 2026-08-15 20:5x.* ⚠ *restore-census is **RED** —
   `hr_unlocks` is unclassified (§2b). **Classify it before the drill**, or the census cannot
   serve as the diff target the drill needs.*
2. **Tyler clicks Restore to a New Project** on the newest backup (§7 item 1). Nothing about
   production changes; the source project stays live and serving players throughout.
3. **Disarm cron on the clone immediately** (§4d step 4).
4. **Run gates 1–8 against the clone.** Record every number. Gate 7 is the one most likely
   to fail and the one worth the whole exercise.
5. **Diff the clone against the production census.** Any table where the clone is short is a
   finding; write it into `tests/restore-census.baseline.json`.
6. **Record the measured RTO** — backup age at restore, wall-clock to `ACTIVE_HEALTHY`,
   wall-clock to all gates green — in this document and in `restore_drill` in the census
   baseline.
7. **Delete the clone.** ⚠ Deleting a project permanently destroys its backups too
   (documented). Explicit authorisation, as with any destructive step.
8. **Set `restore_drill.last_executed`** in `tests/restore-census.baseline.json`. The census
   prints `NEVER EXECUTED` on every run until it is set — deliberately, so that the gap
   cannot go quiet.

**Repeat cadence once it works:** before the cutover, and after any change to the auth
schema, the role setup, or the Edge Function's connection path.

---

## 10. RTO / RPO — stated honestly

| Scenario | RPO (data lost) | RTO (time to serving) | Verified? |
|---|---|---|---|
| Today, daily backup, mechanism A | 0 → 23h59m depending on the hour | unknown | **NOT MEASURED** |
| Today, daily backup, mechanism B | same | ~15–30 min provisioning + reconfiguration | **ESTIMATED, NOT MEASURED** |
| With PITR-7 | **~2 minutes worst case** | as above | not applicable — PITR is off |
| Repo rebuild, no backup | **everything in the 36 restore-only tables, and every player account** | ~10 min to apply the chain | schema half ✅ verified; the rest is total loss |

**Every "unknown" in that table is closed by running §9 once.** A number you have not
measured is a hope.

---

## 11. Capacity — because a restore you cannot afford to take is not a plan

Measured 2026-08-15, **all figures below re-measured 20:55 UTC** ✅.

* **The disk is 2 GB, not 8 — and this is the number that binds.** `GET
  /v1/projects/{ref}/config/disk` → `{"size_gb": 2, "iops": 3000, "type": "gp3",
  "throughput_mibps": 125}` ✅, and `/config/disk/util` → **425.7 MiB used of 1.93 GiB
  (21.5%), 1.52 GiB free** ✅ — up **704 kB in ~10 hours**, i.e. flat. Note the gap:
  `pg_database_size` says **21 MB** but the filesystem holds **425.7 MiB** — WAL, catalog and
  logs are the rest, and *the disk fills on the filesystem number, not the database one*.
  `/config/disk/autoscale` returns all nulls ✅ — **no custom autoscale policy is
  configured**, so the platform default applies and the ceiling is whatever Supabase grows it
  to, billed per GB. Do not plan against 8 GB.
* **Database: 21 MB** (`pg_database_size`, was 20 MB this morning). The 244 MB /
  94%-`game_events` incident is fully resolved: `game_events` is **5,174 rows / 1,136 kB**,
  down from 1,598,269 rows / 229 MB. It remains the largest table in the database and is
  **5.4% of it**, versus 94% at the incident.
* **The retention fix is working, and by a factor nobody should have to guess at.** Rows per
  day, by day: **2026-08-11: 5,089** (the day the cap landed) → **08-12: 14** → **08-13: 6**
  → **08-14: 11** → **08-15: 54**. The 08-15 figure is **~5× the settled rate and it is
  explained, not mysterious** — the race test and the new activity/gold/claim verbs shipped
  today and each writes events. Taking the honest worst case of **54 rows/day across 8 users
  ≈ 6.8 rows per player per day** (rather than the settled 1.4), 100× players is
  600 × 6.8 × 7-day retention ≈ **28,600 rows ≈ 3.7 MB steady state**. Still nothing. Against
  a prior rate near 400,000 rows/day this remains a **~7,400× reduction**. No action —
  **but 08-15 is the first day since the cap that the rate rose, so the next reading is worth
  taking rather than assuming.**
* **`player_ledger` is the table that will actually grow, and its policy already exists** —
  `hr_ledger_config.retain_days = 90`, with `hr_ledger_prune` rolling aged rows up into
  `player_ledger_rollup` (per user/slot/month/kind, gold in and out) before deleting them.
  That is the right shape: aggregates and value transfers, never per-tick.
  At **215 bytes/row** measured, and ~300 ledger rows per active character per day:

  | players | `player_ledger` at 90 days | against a 2 GB disk holding 425 MiB already |
  |---|---|---|
  | 6 (today) | ~35 MB | fine |
  | 60 (10×) | ~350 MB | ~775 MiB total — **~40% of the disk**, comfortable but no longer trivial |
  | 600 (100×) | **~3.5 GB** | **exceeds the whole 2 GB disk on its own.** Autoscale would grow it and bill for it; this is a cost event, not an outage, but it is a cost event nobody has budgeted |

  **That is the capacity headline: the first thing to outgrow this project is
  `player_ledger` against a 2 GB disk, and it happens somewhere between 10× and 100×
  players.** The lever is `hr_ledger_config.retain_days` (90 today) — halving it halves the
  table, and the rollup already preserves the aggregate history that matters. Revisit that
  number before 100×, not during it.

  **A second finding worth acting on before 100×, not after:** `hr_ledger_prune(20000)` runs
  hourly, and its `limit` is per invocation ✅ — a hard ceiling of **480,000 rows/day**. At
  600 players that is a budget of **800 ledger rows per character per day**. Realistic load
  (~300) fits with room; the worst case the design permits (`ACCRUE_MIN_MS` = 60,000 ⇒ one
  accrual per minute ⇒ 1,440/day) **does not** — past day 90 the arrival rate would exceed
  the prune rate and the table would grow without bound. The fix when it is needed is one
  number (`p_limit`, or the cron frequency), which is why this is a note and not a blocker.
  **Add it to the observability list: alert when `player_ledger` row count rises for 7
  consecutive days.**

* **Retention coverage — every growing table, audited 2026-08-15 20:5x UTC** ✅. The rule is
  that an append-only table ships its retention policy in the migration that creates it. Here
  is where that actually stands, measured rather than assumed:

  | Table | rows | Policy | Enforced by | Verdict |
  |---|---|---|---|---|
  | `game_events` | 5,174 | 7 days | `trim-game-events` cron → `hr_trim_game_events(7)` | ✅ covered, ran 03:00 today |
  | `player_ledger` | 29 | 90 days + rollup | `hr-ledger-prune` hourly, `hr_ledger_prune(20000)` | ✅ covered |
  | `player_intents` | 22 | 24 h (floor 1 h) | `hr-intents-prune` hourly | ✅ covered |
  | `player_progress` | 3 | 31 d, **periodic rows only** (`period_key <> ''`) | `hr-progress-prune` daily | ✅ correct — permanent progress is deliberately never pruned |
  | `hr_rejections` | 2 | 180 d (floor 30 d) | `hr-rejections-prune` daily | ✅ covered |
  | `chat_messages` | 8 | 60 d | `trim-chat-messages` cron | ✅ covered |
  | `hr_rate_counters` | 145 | none needed — bounded by PK | upsert on `(user_id, bucket)` | ✅ bounded by design, not append-only |
  | `session_claims` | 6 | none needed — `primary key (user_id)` | one row per user | ✅ bounded |
  | `player_ledger_rollup` | 0 | **none — and this is the deliberate one** | — | ⚠ see below |
  | `maintenance_log` | 112 | **NONE** | — | ⚠ gap, low severity |
  | `maintenance_alerts` | 13 | **NONE** | — | ⚠ gap, low severity |
  | `bug_reports` | 27 | **NONE** | — | ⚠ gap, low severity |

  **`player_ledger_rollup` having no prune is correct** — it is the *destination* of the
  ledger prune and exists to outlive the rows it summarises. But it is not free:
  `primary key (user_id, slot, month, kind)` means it grows by *players × slots × kinds* rows
  **every month, forever**. At 600 players × 3 slots × ~6 kinds that is **~11k rows/month,
  ~130k rows/year (~28 MB/year)** — slow, bounded per month, and it should be a conscious
  decision rather than a discovery in year two. **Recommendation: none today; revisit when
  `player_ledger_rollup` passes 100k rows.**

  **The three `NONE` rows are a real gap and a small one.** `maintenance_log` grows at
  **~25 rows/day** ✅ (hourly cron-health plus the daily jobs) — about **9k rows/year**,
  under 2 MB, and it does not scale with players. `maintenance_alerts` and `bug_reports` grow
  slower still. **None of these blocks cutover.** But all three are observability tables that
  will be read during an incident, and an unbounded table with no stated policy is exactly
  the shape that produced the `game_events` incident — the difference is three orders of
  magnitude in rate, not in kind. **Recommended (P3, Backend Architect's call since it is a
  migration): one `hr_maintenance_prune()` retaining 180 days of `maintenance_log` and acked
  `maintenance_alerts`, on the existing 04:xx cron slot.** Explicitly NOT recommended for
  `bug_reports` — those are player-reported evidence and should be curated, not aged out.
* **Connections: 60 max, 24 in use** ✅ — `ci_micro.connections_direct = 60` from the billing
  API matches the database exactly. Pooler allows 200. The hard rule in design §2a-ii
  (port 6543, never 5432) is what keeps this from being the first thing to break, and §5
  item 5 is where a restore could quietly violate it. **The pooler is correctly configured
  today** ✅ — `GET /config/database/pooler` returns `pool_mode: "transaction"`, port
  **6543**, host `aws-1-us-west-2.pooler.supabase.com`, SCRAM auth. Re-verify that after
  any restore: a new project gets a new pooler host, and rebuilding `HR_ENGINE_DB_URL`
  against port 5432 would work in testing and exhaust the pool in production.

* **Connection headroom against the 80-calls/min/user ceiling — the number that was missing,
  and it bites before the disk does.** The binding limit is **not** `max_connections = 60`;
  it is **`hr_engine_login`'s `connection limit 20`** ✅, which is the whole point of that
  setting — the engine cannot starve PostgREST, `pg_cron` or the dashboard no matter how
  badly it behaves. Grounding the model in a measured figure rather than a guess:
  **`hr_apply` mean execution 28.7 ms over 29 real calls, max 142.7 ms** ✅
  (`pg_stat_statements`; the multi-second entries in that view are the deliberate
  lock-contention race test, not representative). At 20 backend connections and 28.7 ms per
  transaction, the engine's theoretical ceiling is **~700 accruals/second** with perfect
  packing — call it **~500/s** with realistic scheduling slack.

  | players | at the permitted 80 calls/min/user | connections needed at 28.7 ms | vs `connlimit 20` |
  |---|---|---|---|
  | 6 (today) | 8/min = 0.13/s | ~0.004 | 0.02% — irrelevant |
  | 60 (10×) | 4,800/min = 80/s | **~2.3** | 11% — comfortable |
  | 600 (100×) | 48,000/min = 800/s | **~23** | **EXCEEDS 20 — saturated** |

  **So the engine's connection budget is exhausted somewhere around 520 concurrent players
  sustaining the maximum rate the rate-limiter permits.** Two honest caveats, both of which
  make this less alarming than the table looks: 80 calls/min/user is the *rate-limit ceiling*,
  not expected play — a real idle-game client sends far fewer — and saturation here degrades
  as queueing at the pooler (slower accruals), **not** as an outage, because Supavisor holds
  the clients rather than erroring. **This is a P2 to revisit before 100×, not a blocker for
  cutover at 6–60 players.** The lever is one number (`connection limit` on
  `hr_engine_login`, with `max_connections` 60 as the true wall and 24 already in use, so
  there is room to raise it to ~30 without touching compute). **Add to the observability
  list: alert when `hr_engine_login`'s concurrent connection count exceeds 15** — that is the
  early warning, and it is currently unmonitored.

  > **Do not "fix" this by raising `max: 2` in `hr-accrue/index.ts`.** That constant is per
  > warm isolate and is correct at 2 (an invocation runs at most two transactions, never
  > concurrently). Raising it multiplies isolates × connections and would exhaust
  > `connlimit 20` at *fewer* players, not more.
* **Query cost, stated honestly.** The daily-budget sum
  (`hr_day_budget_used`: `user_id = ? and slot = ? and at >= ? and at < ?`) is matched
  exactly by `player_ledger_user_idx (user_id, slot, at DESC)` — leading equality columns
  then a range, which is the right index for that predicate. **But `EXPLAIN` on production
  today returns a Seq Scan (cost 1.10) because the table holds 3 rows** ✅, which is correct
  planner behaviour and proves nothing either way. **The access path must be re-measured at
  real volume; it is not verified today and I will not claim it is.**
* **Advisors, run 2026-08-15** ✅: security **0 ERROR** (79 WARN, 12 INFO — dominated by
  `authenticated_security_definer_function_executable`, which is this architecture working
  as designed); performance **0 ERROR** (42 `multiple_permissive_policies`, 30
  `auth_rls_initplan`, 9 unused indexes, 7 unindexed FKs). **Every one of the 30
  `auth_rls_initplan` warnings is on a legacy table the cutover wipes** — `game_saves`,
  `game_events`, `chat_messages`, `clan_*`, `market_*`, `session_claims` — and none is on a
  `player_*` table, because `player_tables_rls_initplan` already fixed those. **Do not spend
  effort there.**

---

## 12. NOT EXECUTED — the honest register

Kept so that nobody reads this document as a completed capability.

**Restore-readiness scored, 2026-08-15.** Of the eight verification gates in §6, **six can be
and have been proven against production today** (1, 2, 3, 4, 5, 6 — all measured ✅), **one is
now fully written but never executed** (7 / §6a — and one line inside it, the pooler username
shape, is inferred rather than verified), and **one is untestable without a restore target**
(8). The gates are therefore ~75% proven *as checks*. But the thing they check — **that
Supabase hands the rows back at all — is 0% proven**, and no amount of gate-writing changes
that. **The honest verdict: the preparation is close to complete; the capability is
untested.** One 90-minute drill costing ~$0.04 (§9) moves this from ~75% to ~100%.

| | Why not |
|---|---|
| **Any restore, of any kind** | Destructive and/or billable. Requires explicit authorisation. **This is the open blocker, and §9 now prices it at ~$0.04 — cost was never the reason.** |
| **The pooler username shape for a custom role** (`hr_engine_login.<ref>`) | Inferred from the API's `postgres.<ref>`, not confirmed — the live secret's value is deliberately unreadable. **Closeable today, read-only, one `psql` round trip (§6a-iii step 2).** |
| **`hr_unlocks` DR classification** | The census is RED. A one-line edit to `tests/restore-census.baseline.json`, owned by whoever ships the next migration. |
| **Creating a project or a branch** | Out of scope for this task and billable. |
| **Enabling PITR** | A recurring charge. §8 is the recommendation; the decision is Tyler's. |
| **The §9 rehearsal** | Needs mechanism B, which needs a dashboard click and a cost approval. |
| **RTO measurement** | Falls out of the rehearsal. Every "unknown" in §10 closes with one run. |
| **`hearthrise-leaderboards` in a rebuilt DB** | PGlite cannot host `pg_cron`; the cause is proven ✅ but the job's presence after a *real* rebuild is gate 5, by hand. |
| **`player_ledger` access path at volume** | 3 rows today. Re-measure post-cutover. |

---

## 13. Currency audit — every section walked against production, 2026-08-15 20:55 UTC

The failure mode this table exists to prevent: a DR document that reads authoritative and is
quietly six migrations out of date. **Twelve migrations landed on 2026-08-15/16 and four
sections were already wrong.** Re-run this walk after any migration batch.

| § | Claim | Verdict | Note |
|---|---|---|---|
| 0 | Summary | **STALE → FIXED** | seeded 21→22; `player_*` no longer empty |
| 1 | 8 daily backups, all COMPLETED | **VERIFIED-CURRENT** | re-fetched; identical, cadence gap ≤24h03m |
| 1 | Backup schedule is Enterprise-only (HTTP 402) | **VERIFIED-CURRENT** | unchanged |
| 1 | `hr_engine_login` password set | **STALE METHOD → FIXED** | `pg_roles` cannot answer this; `pg_authid` can. `hr_engine` has *no* password |
| 1 | Restore points unavailable (HTTP 400) | VERIFIED-CURRENT (asserted from prior run, not re-fetched) | |
| 2a | Digest `df0fbe3178…`, 75/171/74/102… | **STALE → FIXED** | now `f166dc74f8e0…`, 76/175/75/103/15/187/447/67/1 |
| 2a | `production_only: NONE` | **VERIFIED-CURRENT (counts)** | object-level delta still last proven 2026-08-14 |
| 2b | Census green, 21 seeded, 66 tables | **STALE → FIXED** | census is **RED**: `hr_unlocks` unclassified; 22 seeded, 67 tables |
| 2c | Group A row counts all 0 | **STALE → FIXED** | every progression table now non-zero |
| 2c | Group C operational counts | **STALE → FIXED** | + `hr_rate_counters` is UNLOGGED (restores empty) |
| 2d | `auth.users` = 8, 17 FKs | **VERIFIED-CURRENT** | count re-confirmed 8 |
| 3 | The four things a restore must carry | **VERIFIED-CURRENT** | unchanged and still correct |
| 4a | Classify-before-restore triage | **VERIFIED-CURRENT** | health endpoint all four services healthy |
| 4b | Mechanism A vs B comparison | **VERIFIED-CURRENT** | API surface unchanged |
| 4c / 4d | The restore procedures | **UNTESTABLE-WITHOUT-RESTORE** | the open blocker |
| 5 | Ref-change checklist | **STALE → FIXED** | `hr-accrue` v12 → **v22**; secret names re-confirmed present |
| 6 gates 1–3 | | **STALE → FIXED** | digest, `hr_unlocks`, `reltuples` trap |
| 6 gate 4 | progression as a set | **VERIFIED-CURRENT** | and now actually exercisable — the tables have rows |
| 6 gate 5 | 9 cron jobs | **VERIFIED-CURRENT +** | all 9 present, active, **zero failures in 48h** |
| 6 gate 6 | `hr_engine` zero table privileges | **VERIFIED-CURRENT** | confirmed 0 after b353 |
| 6 gate 7 | custom-role reset | **WAS INCOMPLETE → REWRITTEN as §6a** | one line inside it still inferred |
| 6 gate 8 | player round-trip | **UNTESTABLE-WITHOUT-RESTORE** | |
| 7 | What Tyler must click | **VERIFIED-CURRENT** | |
| 8 | PITR $100/mo | **VERIFIED-CURRENT +** | + $5/mo Micro→Small = **~$105/mo**; trigger is nearer |
| 9 | The rehearsal | **NOT EXECUTED** | now **priced: ~$0.04** |
| 10 | RTO/RPO | **UNTESTABLE-WITHOUT-RESTORE** | every "unknown" closes with one drill |
| 11 | Capacity | **STALE → FIXED** | disk/db/events refreshed; **connection model added**; retention coverage audited |

---

## Appendix — the guards that keep this document from going stale

* `tests/schema-drift.mjs` — the repo rebuilds the schema to a pinned fingerprint.
  `--mutate` proves it sees failure (7 planted defects).
* `tests/restore-census.mjs` + `tests/restore-census.baseline.json` — **new.** Which rows a
  rebuild gives back and which only a backup has; pins all 22 seeded catalogues and 8 cron
  jobs; **fails the build on a new table whose DR class nobody has decided**. `--mutate`
  proves it sees failure (5 planted defects, 4 caught by the census and 1 deliberately
  caught upstream — see below).
* `tools/gen-catalogues.mjs --check` — content drift in the generated catalogues. Stronger
  than any count; do not duplicate it.
* `hr_assert_grant_hygiene()` — nightly on `pg_cron`, owns grants and role capability.

> **One finding from building the census, recorded because the *shape* of it recurs.**
> The plan was to prove the count-pin bites by shrinking `hr_castle_items` — the catalogue
> that `server-authority.md` §3.4 records as having no drift guard. It was caught, but **by
> `2026-08-08-clan-seat.sql`'s own self-check, not by the census** — so as a proof of *this*
> guard it was worthless, and had it been left there this file would have shipped with a
> mutation that validated somebody else's assertion. That self-check reads `if v_n < 34`: a
> **floor**, not an equality. So a catalogue that *shrinks* fails the migration and a
> catalogue that **grows** applies perfectly clean. The mutation is now a **pair** — shrink
> (caught upstream, by design) and grow (caught only by the exact count pinned here) — and
> the census carries the only guard that covers the second direction. §3.4's claim was
> right about content drift and wrong about count drift, and the difference was only
> visible by executing the mutation instead of reasoning about it.
