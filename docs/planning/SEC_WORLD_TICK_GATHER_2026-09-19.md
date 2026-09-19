# Security review — the world tick, GATHER channel in shadow (`lane/world-tick-gather`)

**Reviewer:** security-engineer · **Branch reviewed:** `lane/world-tick-gather` @ `eeb331aa`, diffed
against `set/b550` @ `ab7572e7` (one commit, 10 files, +1579/−11) · **Review branch:**
`sec/world-tick-gather` · **Date:** 2026-09-19

**VERDICT: GO-WITH-CHANGES.** Three of the five required changes are defects I reproduced by
executing the migration, not by reading it; S-1 alone means the tick as staged cannot settle a
single byte. Nothing here moves player value today — the service is not deployed, the migration is
not applied, and the ownership flag defaults to NOT OWNED — so this is a correctness and
reachability verdict, not an incident.

**No production writes and no production reads were made.** This session holds no database access
by design; every executed arm below ran against a PGlite database rebuilt from
`supabase/migrations` in `tests/schema-apply-order.json` order, on a synthetic character whose uuid
`gen_random_uuid()` cannot mint.

> **A note on the file's path.** The brief named `.claude/coordination/SEC-world-tick-gather.md` as
> "the existing convention". It is not: `.claude/coordination/` contains no security verdict and
> never has. The convention in this repo is `docs/planning/SEC_<TOPIC>_<DATE>.md`
> (`SEC_FIGHT_CARRY_2026-09-16.md`), and the brief's own escape hatch says to follow the real one.

---

## 1. Findings

| # | Severity | Title | Status | Required change |
|---|---|---|---|---|
| **S-1** | **P0 — blocking** | `hr_tick` holds EXECUTE on `hr_apply` but `hr_apply` refuses it: the impersonation seam tests `v_role = 'hr_engine'` **literally**. The tick can settle nothing, and every attempt journals `forbidden_impersonation`. | **CONFIRMED by execution** | Extend the seam to the tick role — which means splicing the LIVE `hr_apply`, so this stops being a "restates no body, moves no live hash" migration. See §3. |
| **S-2** | **P1** | `hr_tick_roster`'s `leased` CTE joins on `(user_id, slot)` while the primary key is `(user_id, slot, channel)`: one GATHER roster call stamps a lease on the character's COMBAT row — which it never locked and which is not owned — and returns the character **twice**. | **CONFIRMED by execution** | Carry `channel` in the `claim` projection and add `and o.channel = c.channel` to the UPDATE's WHERE. |
| **S-3** | **P1** | The "belt and braces" second defence does not exist. `hr_apply` clamps the *watermark* (`least(now(), greatest(old, proposed))`) but applies the *value* regardless — a replayed window with a fresh version pays again. The tick's idempotency key omits `version`, which the accrual engine's key includes. | **CONFIRMED by execution** | Put `version` (or the window's END watermark) into `tickIntentId`, and correct the three comments that claim arithmetic refuses a replay. |
| **S-4** | **P2** | `restore-census` is **RED**: `hr_tick_ownership` is a new player-scoped base table with no DR class and no player-value ruling. A §3.3 lane-C gate the lane has not passed. | **CONFIRMED — exit 1** | Classify it in `tests/restore-census.baseline.json` (`operational` + `player_value_exempt` with the written reason, on the argument the file's own §3 already makes: it is a rollout switch, the watermark is the correctness mechanism). |
| **S-5** | **P2** | `gatherDryRun`'s `overlap` count is `from < prevTo`, which is the shape of **every** honest deferred window since `settledWatermarkMs` landed. The tool prints "an OVERLAP would be a double pay" over it. **This is the source of the 15 unexplained overlaps.** | **CONFIRMED by execution** | Classify the boundary with `settledWatermarkMs` as `replayStream` already does, or delete the claim. |
| **S-6** | **P3** | `settleGatherSession` emits N flush intents all carrying the hydration `version` (`gather.js:204`, never reassigned). Intents 2..N are stale by construction. Fail-closed, but it is exactly the line a step-2 author will "fix" by substituting a fresh version — which is S-3's exploit. | CONFIRMED (code read) | Emit one intent per call, or make the multi-intent return carry an explicit "re-hydrate between these" contract. |
| **S-7** | Informational | `hr_seed` is granted to `hr_tick` **unscoped** — any user, any label, not only the roster it holds. Identical to the privilege `hr_engine` has held since 2026-08-11, and the header argues it correctly. | Accepted residual | None. Re-open if the RNG oracle is ever used for anything a player can predict-and-choose. |
| **S-8** | Informational | `revoke ... from public` runs *after* `create or replace function` (§5), so there is a sub-second window at apply time where `hr_tick_roster` is EXECUTE-to-PUBLIC. House-wide pattern, and the function moves no value. | Accepted residual | None for this file. |

### What I checked and found **closed**

Grants and reachability (`§5`, self-check `e2`/`e2b`/`e10`); `hr_tick_ownership` unreachable in both
directions — RLS enabled **and** forced, zero policies, zero grants for `public`/`anon`/
`authenticated`/`service_role`/`hr_engine`/`hr_tick` (`e3`/`e3b`/`e3c`); `hr_tick` holding zero table
privileges and **exactly** three routine grants as an equality test (`e5`/`e6`); the fail-safe
default `owned = false` and an empty roster while nobody is owned (`e4`/`e8`); a non-payable channel
refused rather than filtered, at both the CHECK constraint and the argument (`e4b`/`e7`); `SECURITY
DEFINER` with `set search_path = public` on both new functions; every argument clamped
(`p_limit → [1,500]`, `p_lease_ms → [5s,300s]`, `p_holder → 64 chars`); the clock is `now()`
throughout and no client timestamp reaches any of it; `hr_state_of` needing no grant because the
definer calls it; the shadow service importing no Supabase client, no `fetch` and no write path;
`tools/world-tick-replay.mjs` keeping its SELECT-only guard; the SQL/JS catalogue drift guard
(`P-G7`) reading this migration's own text; and `c_max_span = 24 h` genuinely equalling
`ACCRUE_MAX_SPAN_MS`. The `grant hr_tick to authenticator` in §1 is **correct and load-bearing**, not
a hole: `hr_tick` is `nologin`, so `SET ROLE` from `authenticator` is the only way to reach it short
of handing the tick host the owner credential, and `hr_engine` has been granted the same way since
2026-08-11 — minting a `role: hr_tick` JWT needs the project JWT secret, which already yields
`hr_engine` and therefore `hr_apply`. The blast radius is unchanged.

---

## 2. The Coordinator's two open concerns, answered

### (a) Is the tick RPC fenced so no client role can call it or choose whose world ticks? — **Yes, and I executed the fence.**

`hr_tick_roster` is `revoke`d from `public`, `anon`, `authenticated` and `service_role` and granted
to `hr_tick` alone (`2026-09-20-world-tick-roster.sql:353-355`), with `hr_shard_of` revoked the same
way and granted to nobody (the definer calls it). It is `SECURITY DEFINER set search_path = public`,
and it carries a **secondary** GUC identity seam (`:265-270`) that refuses `anon`/`authenticated`/
`service_role` even in an owner context — the same posture as `hr_apply`, and the file says plainly
that the GRANT is the primary control. Self-check `e10` performs the exact `SET LOCAL ROLE
authenticated` transition PostgREST performs and requires `insufficient_privilege`; `e2` asserts no
client grant exists; `e6` asserts `hr_tick`'s routine grants are **exactly three** as an equality, so
a fourth arriving later is a review failure rather than a convenience. `node tests/schema-drift.mjs`
exits **0**, which means all eleven of those gates executed on a real rebuilt database and passed,
and that the file re-applies byte-identically.

"Choose whose world ticks" is closed one level deeper than the grant: the roster's row set is
`hr_tick_ownership ⋈ player_state` where `owned` is true and the channel equals the character's
server-owned `active_kind`. `hr_tick_ownership` has RLS enabled **and forced** with **zero
policies** and **zero grants**, so no client role can read it, write it, or learn from it — and a
missing row, a false flag or an unreadable table all mean NOT OWNED. The caller's only influence is
`p_kinds` (validated against a literal and *refused*, not filtered), `p_shard`, `p_limit`,
`p_holder` and `p_lease_ms`, all clamped. No request field selects a user.

**The one thing that is not fenced is the opposite problem — S-1.** The migration grants `hr_tick`
EXECUTE on `hr_apply`, but `hr_apply`'s own impersonation seam is a literal string test:

```sql
-- 2026-09-14-hr-apply-restatement.sql:698-708
v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
if v_role = 'hr_engine' then
  v_uid := coalesce(p_user, auth.uid());
else
  v_uid := auth.uid();
  if p_user is not null and p_user is distinct from v_uid then
    perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'forbidden_impersonation', ...);
    return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
```

`hr_tick` is `nologin`, so `auth.uid()` is NULL for it and every `p_user` it names is "distinct
from" NULL. Executed on the rebuilt schema:

```
[role=hr_tick  ] tick settle     ok=false err=forbidden_impersonation  gold=0   ver=1
[role=hr_engine] engine settle   ok=true  err=-                        gold=100 ver=2
```

Same delta, same key, same version — only the role differs. So the lane's central claim, that the
tick is "just another server-side caller of the writer that already exists" and that `hr_apply` is
UNCHANGED, is **false as staged**: the tick would settle nothing, and each refusal writes a
`forbidden_impersonation` rejection — the highest-signal anti-cheat alert this system has — at
roughly one per flush per character, which at the design's 500 characters / 90 s flush is a
continuous forgery alarm generated by our own infrastructure.

There is no way to close this inside the new file. `hr_apply` must learn the tick role, which makes
this an anchored splice on the LIVE body of the function that writes all player value — a different
review with the full lane-C treatment (derivation chain position, last-toucher, `live-hash-drift
--live --write`, a §4 self-check that executes the new seam, and the `--mutate` proof that it
bites). **My recommendation is to prefer the alternative that needs no splice: let the tick present
`hr_engine`.** The privilege is identical by the file's own argument, the seam already accepts it,
and the separation the second role buys is observability — which `journal.meta.src = 'tick'` already
provides, at no cost to a money function. If the team wants the distinct role for blast-radius
reasons, that is defensible, but it is a `hr_apply` migration and it does not ride this one.

### (b) Can a tick and a client-triggered accrue both settle the same window? — **No. The prevention is real, it is in SQL under a row lock, and I executed it. But it is not the mechanism the lane says it is, and one of the two defences the lane names does not exist.**

**What actually prevents it: the optimistic-concurrency compare-and-set, under `for update`.**
`hr_apply` takes the per-character row lock and *then* compares the version:

```sql
-- 2026-09-14-hr-apply-restatement.sql:879-891
begin
  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then perform public.hr_reject('no_character'); end if;
  if p_version is null or p_version <> v_st.version then
    perform public.hr_reject('version_conflict', ...);
```

That ordering is the whole answer to "is it enforced in SQL under concurrency, or only in the edge
code": the lock is taken before the read, the comparison is against the locked row, and the UPDATE
that bumps `version` is in the same transaction — a genuine compare-and-set, not an edge-side check.
A missing version is itself a conflict (`p_version is null`), so no caller can opt out. Executed,
both callers holding version 1 for the same window:

```
accrue (key A)   ok=false  err=version_conflict   gold=100  ver=2
tick   (key T)   ok=false  err=version_conflict   gold=100  ver=2
-> gold=100 : NO DOUBLE PAY (the version CAS refused the second)
```

The differing idempotency keys do **not** save it and were never going to: the tick's key is
`uuid5('tick:<shard>:<user>:<slot>:<windowFromMs>')` (`gather.js:285`) and the engine's is derived
from `(user, slot, watermark, version, salt)`, so a tick and an accrue settling the same window
produce two *different* keys and dedup catches neither. The version CAS is what closes it, and it
closes it completely for as long as the tick's `version` and its batch watermark come from the same
hydrate.

**What does NOT prevent it — and the lane asserts it three times.**
`services/world-tick/gather.js:283`, `gather.js:244` and
`2026-09-20-world-tick-roster.sql:32` all state that `hr_apply` clamping `accrued_to` into
`[old, now()]` means "a replayed window is refused on arithmetic even if the key were lost". It is
not refused. `v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued))` (`:2288`) clamps the
**timestamp** and then the UPDATE applies the **value** anyway:

```
replayed window  ok=true  err=-  gold=100 -> 200  ver=3
accrued_to moved? NO (clamped to greatest(old, proposed))
-> THE VALUE LANDED ANYWAY
```

A fresh version carrying an already-settled window pays twice and moves the watermark zero
milliseconds. So there is exactly **one** defence against a replayed tick window, not two, and the
tick's own idempotency key is the weaker of the two available spellings because it omits `version`
— the term the accrual engine's key includes precisely so that a re-derivation after a conflict is
a *new* key. `gather.js:204` (`let version`, never reassigned, N intents per call) is the concrete
place where a step-2 author will reach for a fresh version to make flush #2 land, and doing that on
a batch computed from the old watermark is this double pay, silently, with an honest-looking ledger
row. Required change S-3 plus S-6.

**The 15 overlapping settle windows are a measurement artefact, not a double pay.**
`gatherDryRun` counts an overlap as `from < prevTo` (`services/world-tick/replay.js`, the
`prevTo` comparison) and `tools/world-tick-replay.mjs` prints "an OVERLAP would be a double pay"
above that number. Since `settledWatermarkMs` landed on 2026-09-16, the next window's `from` is
deliberately `prev.to` **minus the deferred sub-action remainder** — so `from < prevTo` is the
signature of every correctly deferred window. Constructed from `settledWatermarkMs`'s own output and
executed:

```
window 1: 00:00:00.000Z → 00:00:10.000Z, 3 ticks @ 3000 ms
settledWatermarkMs      -> 00:00:09.000Z   (deferral 1000 ms)
gatherDryRun            -> overlap = 1
replayStream            -> { watermark_exact: 1, watermark_mismatch: 0 }
```

The same pair, on the same rows: the naive metric calls it an overlap, and the file's own
`replayStream` — the one that knows the arithmetic — proves the boundary exactly correct. The
authoritative signal for a real double pay already exists and is `watermark_mismatch` — the replay's
own bucket for "the boundary disagrees with `settledWatermarkMs`", which is a different number from
the dry run's `overlap` and is the one worth reading. I have not seen the step-1 run's bucket table,
so I am not asserting all 15 are benign on my own authority: the
required change is to re-run `--gather` after classifying with `settledWatermarkMs`, and if any
survive, *those* are the finding. On the evidence available they are the deferral.

---

## 3. Conditions of the GO

1. **S-1 before any apply.** Either point the tick at `hr_engine` (recommended — no money-function
   change, and `meta.src='tick'` already gives the operator the asymmetry the role was for), or
   land the `hr_apply` seam splice as its own lane-C migration with its own Security review. Until
   one of those, applying this file installs a role that cannot do the one thing it exists to do.
2. **S-2 and S-3 fixed in this file / this lane**, with `tests/world-tick-writer-authz.mjs` green.
3. **S-4: classify `hr_tick_ownership`** — `node tests/restore-census.mjs` must exit 0 before apply.
4. **S-5: re-run `tools/world-tick-replay.mjs --gather`** with the corrected classification and
   report what, if anything, remains overlapping.
5. **Step-2 secrets, stated now rather than at deploy.** Reaching `hr_tick` (or `hr_engine`) means a
   JWT signed with the project secret, living on the tick host. It is never the service-role key,
   never in the repo, never in argv — same contract as `~/.supabase-token` (CLAUDE.md §2). The
   smoke suite's secret guard should cover `services/world-tick/**` before that host exists.

Not blocking, but on the record: the tick makes the per-call clamps materially looser in effect (one
call carrying ~9 polls' worth of value instead of nine calls), so the per-day ledger budget becomes
the only binding bound on a compromised tick host. That is the same posture as a compromised edge
deploy and the file argues it honestly — but it is the bound, and it should be the one that gets an
alert.

---

## 4. Executed evidence

| Command | Exit | What it showed |
|---|---|---|
| `node tests/schema-drift.mjs` | **0** | The migration applies in chain order, its §6 `e1`–`e11` gates all executed and passed, and the repo rebuilds to the committed fingerprint `73bfdbed0c7b…` with a byte-identical second apply |
| `node tests/world-tick-parity.mjs` | **0** | P1–P4 and P-G1–P-G8 green on the lane as handed over (3 fixtures, 10 min span, 10 s cadence) |
| `node tests/restore-census.mjs` | **1** | `UNCLASSIFIED TABLE: public.hr_tick_ownership` + `PLAYER-SCOPED TABLE WITH NO RULING` — S-4 |
| `node tests/world-tick-writer-authz.mjs` (added here) | **1** | 5 open findings: S-1, S-3, S-4a/S-4b (as S-2 above), S-5; and **S-2 green**, the one arm that passes |
| `node tests/guard-hygiene.mjs` | **0** | After declaring the new guard review-owned in `tests/guards-unregistered.json` |
| `node tools/lane-done.mjs` | **0** | All ratchets green on `sec/world-tick-gather` |

`@electric-sql/pglite` is a declared devDependency but was absent from this container; it was
installed with `--no-save`, so `package.json` and `package-lock.json` are untouched.

---

## 5. Residual risk accepted

1. **PGlite is not production.** It is single-connection (so S-2 was proved on the *mechanism* —
   lock ordering and the CAS — rather than on a true concurrent interleaving) and it is PG18 against
   production's PG17. Both caveats are `tests/schema-drift.mjs`'s own, stated in its header. The
   grant and policy assertions are structural and carry over; the concurrency claim should be
   re-confirmed read-only against production before the tick is enabled for a real character.
2. **A compromised tick host can propose any legal delta for any character in its shard**, bounded
   by `hr_apply`'s per-call and per-day clamps and recorded in `player_ledger`. Detectable and
   reversible, not prevented — identical to the standing `hr_engine` acceptance, and the file makes
   the argument correctly.
3. **`tests/world-tick-writer-authz.mjs` is red and is deliberately not in `smoke.yml`.** A red guard
   on the shared workflow makes the CI gate unreachable for every other lane (the b512 class). It is
   declared in `tests/guards-unregistered.json` with `disposition: review-open`; registering it in
   the `guards` job is part of the lane's closing work, and that entry is deleted when it goes green.
4. **S-1's recommended fix is mine, not the author's.** If the team lands the `hr_apply` splice
   instead, that migration needs its own adversarial review — I have not reviewed a body I have not
   seen, and I will not pre-approve one.
