# Security review — `fight` checkpoint authorship (lane record, 2026-09-16)

**Reviewer:** security-engineer · **Branch:** `worktree-agent-a6bfcb4b913e60591` (merged `origin/set/b548`)
**Trigger:** reliability lane reported two SLIPPED mutants in `tests/live-settlement.mjs --mutate`
(`no-hp-ceiling`, `no-monster-lookup`).
**Verdict: GO on the current live surface. No migration. The detector gap was real and is closed.**
No production writes were made; every live query below was read-only (`pg_proc`, `pg_policy`,
`information_schema`).

---

## 1. The three questions

### (1) Can a client write a `fight` checkpoint the next accrual window trusts? — **No. CONFIRMED closed.**

The only writer of `player_state.fight` is `hr_apply`, and its grants on production are:

```
hr_apply  secdef=true  acl = postgres=X/postgres | hr_engine=X/postgres
```

`anon`, `authenticated` and `service_role` hold no EXECUTE. `player_state` itself is
`SELECT`-only for `authenticated` (column grants confirm SELECT on `fight`, no UPDATE anywhere),
RLS is on, and the table carries exactly one policy — `"player_state own read"`, `cmd = r`,
`(select auth.uid()) = user_id`. There is no `INSERT`/`UPDATE`/`DELETE`/`ALL` policy, so PostgREST
refuses every write regardless of payload.

Of the 81 functions executable by `anon`/`authenticated` on production, exactly one mentions
`fight`: `hr_create_character(p_slot integer)`, which takes no fight argument and seeds `'{}'`.
`hr_put_client_state` (the one client-callable writer into `player_state`) is rate-gated and routes
to `hr_put_client_state__ungated`, which is `postgres`-only and writes the `client_state` residue
column; it does not reach `fight`.

The engine half is identity-clean too: `supabase/functions/hr-accrue/index.ts:238` derives the user
from a verified JWT (`verifyJwt(bearerOf(...))`), and the fight input at `index.ts:875` is
`fight: st.fight ?? null` — `st` is the `hr_state_of` projection from the same transaction, never
the request body (the file states this at `:812`, `:959`, `:986`).

Validation that exists, in `hr_apply` under the row lock
(`supabase/migrations/2026-08-17-fight-carry.sql:1076-1132`, and re-installed verbatim by the live
last toucher `2026-09-14-hr-apply-restatement.sql:1454-1464`):

| Check | Code | Refusal |
|---|---|---|
| object shape / key allowlist | `fk not in ('monster','hp','kills')` | `bad_fight` |
| key **presence** before type (three-valued-logic hole, Security F2) | `v_fight ? 'monster' and v_fight ? 'hp' and v_fight ? 'kills'` | `bad_fight` |
| monster id looked up against the generated catalogue | `select max_hp into v_fight_max from public.hr_activities where kind='combat' and activity_id = v_fight->>'monster'` | `unknown_monster` |
| hp integer, `>= 1`, `<= v_fight_max` | `(v_fight->>'hp')::numeric > v_fight_max` | `bad_fight_hp` |
| kills integer, `0 .. c_max_fight_kills` | — | `bad_fight_kills` |
| refused, never clamped; whole delta rolls back | `hr_reject` raises `HR000` | — |

Live body confirmed by read-only query: `hr_apply` on production contains `bad_fight_hp`,
`unknown_monster`, `if v_fight_max is null` and `> v_fight_max` (body md5
`1ad0e5936b5b2f9b6c5bd83037479a69`).

### (2) Economic effect if it were writable — **quantified, and it is why the clamp exists.**

`tests/live-settlement.mjs` measures it directly with the engine. A forged
`{monster:'dragon', hp:1, kills:0}` on a 520 HP dragon takes a fixture that pays **3 kills /
1265 gold per 60-minute window** to a kill on the first swing of *every* window. At the production
accrue rate gate (30 calls/minute) that is a per-day faucet bounded only by the ledger day budget,
plus the full dragon drop table and combat XP each time. Blast radius: **whole economy** —
minted drops are market-listable, so forged value crosses to other players. This is the mint the
migration's own header describes; it is closed today, not theoretical.

### (3) Reachable on production today? — **No.** Reachable only if a future change

(a) grants `hr_apply` to `authenticated`/`anon`/`service_role`, or (b) adds a write policy or write
grant on `player_state`, or (c) lands an `hr_apply` restatement that drops the ceiling or the
catalogue lookup. (a) and (b) are already asserted by `live-settlement.mjs` sqlGuard; (c) is the
gap this lane closes.

---

## 2. Why the two mutants slipped — the finding

**It is a detector gap, not an exploit.** Both mutants edit `supabase/migrations/2026-08-17-fight-carry.sql`,
which stopped being the last toucher of `hr_apply` on 2026-08-18. Six later links of
`HR_APPLY_CHAIN` re-install the entire body, so deleting the ceiling from the file that
*introduced* it changes nothing the database ever executes — a **behaviourally inert mutation**,
graded green, which reads as "no detector".

Worse, the three SQL mutants that *were* caught (`no-void`, `no-presence-test`, `narrow-release`)
were caught by the flat `sql.includes(term)` list in `derivationGuard` — a text check on that same
superseded file. So every textual catch was already one restatement away from being decorative,
and the two that slipped are simply the two terms nobody put on the list.

Proven, not reasoned: planting the same `or false then` mutation in the **live last toucher**
(`2026-09-14-hr-apply-restatement.sql`) makes the base guard exit 1 — and it is caught by that
file's own §4 self-check md5 (`code md5 2a78ffe… expected 820c455…`), i.e. the last toucher is
tamper-evident by construction. The behavioural half (SETTLE-1c, 19 hostile checkpoints incl.
`hp = MAX+1`, `hp = 0`, `ancient_wyrm_of_gold`, `normal_tree`) does run against the replayed final
body and does assert the property.

---

## 3. The fix

**No migration.** The server-side clamp of `fight.hp` to the catalogue max and the monster-id
lookup inside the engine-only writer both already exist, in the live body, with the correct posture
(refused, not clamped; catalogue re-derived under the row lock; not checked against a maximum the
caller supplied). Drafting a lane-C migration to add them would re-add what is there and would put a
57 KB restatement through an apply for no property gain. **Recommended action is the detector only.**

**Detector added** — `tests/live-settlement.mjs`, `SETTLE-1g`: the re-clamp must be present in
**every** file that restates `hr_apply` from fight-carry onward, not only in the file that
introduced it. Four code terms are asserted per link (the `hr_activities` lookup, the
`unknown_monster` refusal, the null-ceiling refusal, the `> v_fight_max` bound), over the existing
comment-stripped body so prose cannot satisfy it. Membership on `HR_APPLY_CHAIN` says a
restatement is *accounted for*; SETTLE-1g says what it must still *contain*; SETTLE-1c says it must
still *behave*. Neither replaces the others.

---

## 4. Evidence

| Command | Exit |
|---|---|
| `node tests/live-settlement.mjs` | **0** — `dragon (520 hp), 60 min: one window 3 kills / 1265g · 60s 3k · 90s 3k · 120s 3k · 300s 3k · no column 0k`; `ceiling parity: 108/108 combat ids match src/data/monsters.js` |
| `node tests/live-settlement.mjs --mutate` | **0** — 10/10 CAUGHT, incl. `no-hp-ceiling` (2) and `no-monster-lookup` (2); `mutation safety: 3 file(s) restored and hash-verified` |
| ceiling mutation planted in the live last toucher (restored) | guard exit **1** |

---

## 5. Residual risk accepted

1. `--mutate` is **not** registered in `.github/workflows/smoke.yml` (the base run is, via
   `tests/run-smoke.mjs:127`). CI therefore proves the property but not that the guard bites.
   Recommended: two steps in the `guards` job, as `schema-drift`/`restore-census` already have.
   Coordinator's file; not blocking.
2. A compromised `hr_engine` (the edge function's role) can still propose any *legal* checkpoint —
   e.g. an honest-looking low HP on a boss it never fought. The clamp bounds it to the catalogue
   max and the void-on-activity-change rule bounds the banking exploit, but within those bounds the
   engine is trusted. Journalled via `player_ledger`; detectable, not prevented.
3. SETTLE-1g is textual per link. A restatement that keeps the four lines but reorders them so the
   ceiling is evaluated before the lookup would pass SETTLE-1g — it would fail SETTLE-1c, which is
   the behavioural authority and runs on the replayed chain.

---

## 6. Addendum, 2026-09-16 — the UTC-midnight §4 fixture change (GATE(f5)/GATE(f6)) — **GO-WITH-CHANGES**

**Is the gate as strong as before against C1/S1 ("settle absorbs the wrong delta") and C5
("zero-claim forgives")? Yes — stronger, and I have the exit codes.** `git diff -U0` confirms the
lane's claim itself: every hunk in `2026-09-01-kill-daily-credit.sql` is at line ≥ 916, the function
body ends at 884 and the `revoke`/`grant` block is 884–886, so no body, grant, policy or ledger shape
moved; the `2026-09-10-attended-loot-credit.sql` change is header prose only. Replaying the chain
with the S1 mutant planted (`v_consumed := v_settle_delta`, line 755) exits **1 at both 01:00:00 and
00:02:30** — `GATE(f6): round 2 applied 40 — expected 28` — and it now bites at ROUND 2 on an exact
per-round expectation instead of only at the final row sum, so a mutant that shrank the round for the
wrong reason can no longer pass as a smaller-but-consistent one. Both files restored byte-for-byte
(sha256 `31079fdf…`, `2e51130e…`, `git status` clean). The zero-claim assertion and the
`daily_kill_settle_absorbed` journal count (C5) are unchanged in substance. Taking the round size
from the server's reported `cap` does **not** weaken it: an *inflated* cap changes nothing (the
40-claim binds, `least(40, cap) = 40`, exactly as the literal did), and a *deflated or zero* cap is
caught one gate earlier and at every hour of the day by `GATE(c)` in
`2026-08-30-bounty-kill-credit.sql`, which pins the formula against literals — planted `cap→0` and
`cap→least(7,…)` mutants both exit **1** with `GATE(c): cap(15,10,60000)=0 expected 130` / `=7`. The
literal anchor was not lost, it moved to the gate that owns it. The `v_c = 0` skip path is reachable
only in `[00:00:00, 00:00:01)` UTC, where GATE(f6) asserts nothing; measured, a replay reaches f6
~6.5 s after start, so landing there needs the clock parked within a second of the boundary and
`GATE(f5)` (literal 40, unclamped `accrued_to`) still runs there. Fixtures cannot collide with a real
player: the uid is the fixed synthetic `000000c7-0000-0000-0000-0000000000c7` (not a v4 UUID, so
`gen_random_uuid` cannot mint it), every write is inside a subtransaction rolled back via `HR821`,
and the block then raises `GATE: §5 LEAKED a probe row` if anything survives in `player_state`,
`player_ledger`, `player_progress`, `player_skills`, `active_bounty`, `hr_kill_credit_log`,
`player_intents` or `auth.users`.

**The CHANGES, and they are the reliability half's claim, not the gate's.** The header now reading
"✅ RESOLVED" and the guard promising the chain "rebuilds at every hour of the day" are **false, and
I measured it on a clean tree**: `[00:00, 00:05)` is closed, but a ~8-second band straddling midnight
is not. Offsets −6 … −1 and 0 … +1 exit **1** on a correct function with `GATE(f5): the credit applied
0 … (expected 3)` — when midnight falls between f5's two credits the clamp pushes the log stamp
FORWARD onto the day start, the anchor collapses and the cap honestly refuses the 15-kill claim;
green again at −7 and +2. `tests/utc-midnight-replay.mjs` cannot see it, because its arms are timed
from process start rather than from when the fixture runs (its −8 "straddle" arm reaches f6 at
23:59:58, still yesterday), and its `+1` arm sits ON the band edge — I measured it GREEN in the full
guard run and RED at the same offset twenty minutes later, so the guard is itself a flake source at
the one hour it polices. I have recorded the measurement in both headers rather than patching another
lane's fixture; the unmet conditions are (a) day-anchor GATE(f5) the way GATE(f6) now is, (b) re-time
the guard's arms so the boundary lands INSIDE the fixture (probe f5's execution offset, then sweep at
1 s granularity), and (c) drop the "✅ RESOLVED"/"every hour of the day" wording from any release note
or DR document until (a) and (b) are green. Until then the operator rule is **do not apply in the last
10 or first 5 seconds of a UTC day**. This does not block the apply: the failure is fail-closed (the
fixture rolls back, the migration refuses), the function body is untouched, and the residual risk I am
accepting is a red CI run or a refused apply inside an 8-second band — never a player-value movement.

### 6a. The CHANGES landed — backend lane, 2026-09-16 (exit codes, not expectations)

All three conditions of the GO-WITH-CHANGES above are met on `worktree-agent-a43bd2d0f232f944e`:

- **(a) GATE(f5) is day-anchored** the way GATE(f6) is — both its stamps use the same
  `greatest(hr_utc_day_start(now()), now() - interval '5 minutes')` expression, so both credits read
  the SAME window; the round size is `v_c = least(40, cap)` from the server's own report, the settle
  is `least(12, v_c)` and the second claim is `v_s + v_d` with `v_d = least(3, v_c - v_s)`, which is
  `<= v_c <= cap` and therefore never cap-bound. 40 / 12 / 3 / **55**, never 67, wherever the window
  allows; the same property at the server's own magnitude below that; `FIXTURE DEGENERATE` raises on
  any day older than one second. The re-timed sweep then found a THIRD instance, **GATE(f4)**, whose
  `cap > 0` degeneracy check raised on a correct function on a day younger than one 600 ms kill; its
  tolerance is now confined to exactly that case and `credited = 0` is still asserted unconditionally.
- **(b) The guard's arms are timed from the FIXTURE**: `tests/utc-midnight-replay.mjs` plants a
  `raise exception 'HRPROBE now=%'` at the GATE(f5) marker, reads the database's own transaction
  timestamp back out of the failure (measured 7.07–9.84 s after process start, jitter recorded in the
  file), restores byte-for-byte, and sweeps midnight **-3 … +9 s** of the fixture's clock — to +9
  because the band is a WINDOW-LENGTH artefact (15 kills need ~6.9 s, 40 need ~18.5 s), not a
  boundary artefact — plus 00:02:30 / 00:04:30 / 00:25:00 against the 01:00 control.
- **(c) The wording is honest**: the `2026-09-10-attended-loot-credit.sql` header says RESOLVED only
  alongside the sweep that proves it, keeps the security measurement verbatim, and names all three
  instances.

Exit codes seen: `node tests/utc-midnight-replay.mjs` **0** (14 arms); `--selftest` **0** — it now
plants TWO mutations, un-anchoring every §4 stamp (RED at the boundary `GATE(f4): the per-day
bounty-free ceiling did not bind (cap 650, credited 400)`, GREEN at 01:00) and the S1 economy defect
(RED at the boundary at the small magnitude, `round 2 applied 4 — expected 0`, and RED at 01:00 at
the full one, `round 2 applied 40 — expected 28`) — which is the answer to "did day-anchoring turn it
into something green at any magnitude": no. `node tests/schema-drift.mjs` **0**,
`node tools/lane-done.mjs` **0**. `git diff -U0` earliest hunk is line 916 and the `do $$` block
starts at 906, so no function body, grant or policy moved: no re-apply, no live-hash re-baseline.
The operator rule ("do not apply in the last 10 or first 5 seconds of a UTC day") is retired by the
sweep, not by assertion.

---

# Adversarial review — `settledWatermarkMs` (the deferred settle watermark)

**2026-09-16 · security-engineer · branch `worktree-agent-a076e0726614423e6` @ b4eaf8e4, merged clean into `set/b548`**

**VERDICT: GO-WITH-CHANGES.** The one change (F1) is made on the reviewing branch with a mutation
proof; nothing else is required before apply/deploy.

## The property this change has to hold, and whether it does

`accrued_to` stops being `now()` and becomes `now()` minus the sub-tick remainder. Every window is
priced `[accrued_to, now]`, so the ONLY ways deferral can mint are:

| # | Mint vector | Closed by | Evidence |
|---|---|---|---|
| M1 | watermark at or below the old one (`hr_apply` clamps `greatest(old, …)`, so the window never advances and the SAME span is paid again) | the strict-advance floor `nowMs - (grantMs - 1)`, which equals `payFromMs + 1` because `grantMs = min(elapsedMs, sinceActivityMs, capMs)` and `elapsedMs = nowMs - payFromMs <= nowMs - accruedToMs` | D9b; probe P1 (`tickMs=120000 > grantMs=90000` advances 1 ms, is never frozen, and self-heals to `now()` the moment `capped` binds) |
| M2 | watermark past `now()` | **WAS OPEN — see F1**; now `Math.min(nowMs, …)` | D9a, mutation-proved |
| M3 | a grant priced per-`grantMs` rather than per-tick, so the overlapping span pays twice | nothing is: `grantMs` reaches only `journal.meta.ms`, `creditWindow` positioning and this function. Every payout is per tick | `grep -n grantMs accrual.js` — 0 payout consumers; probe P6 |
| M4 | total simulated work exceeding wall clock | ticks paid `== floor(elapsed/tick)` exactly, never above | probe P6 over 6 tick/cadence pairs (13 s node: 3461 paid vs 3461 physical max, vs 3000 pre-change); probe P8 over 2401 attacker-chosen poll cadences, best excess **0 ticks** |
| M5 | an attended `hr_kill_credit_log` row projected by two windows (C6) | refusal (d) floors the watermark at `attended.to`, and `attended.to` is genuinely `max(l.created_at)` of the rows the projection consumed (`2026-09-10-attended-loot-credit.sql`, the `w`/`a` CTEs), not `p_upto` | D6/D6b; probe P2 (a `to` above `now` cannot push the watermark past `now`) |
| M6 | replay / two concurrent tabs paying the deferred tail twice | unchanged: the idempotency key and the PRNG label are both `st.accrued_to`, the window **START** (`index.ts:723`, `:1111`), so two tabs on the same watermark produce the same intent id and dedup; `hr_apply` is `least(now(), greatest(v_st.accrued_to, v_accrued))` (`2026-08-11-apply-engine.sql:1044`) plus the version check | D7/D7b; source read |

The author's four refusals were executed, not read: (a) `capped` — note `capped` is
`elapsedMs > grantMs`, so it also fires on an activity-age-bound window, which is *more* often than
"over cap" and in the safe direction; (b) `finalWindow` is a server literal (`index.ts:833` false,
`set-activity.js:977` true) and is reachable from no request field; (c) stopped-early
(`remainder >= step`); (d) as above. Degrade-ladder `attended: null` + `capped` reaches (a) before
(d) matters (probe P3/P3b).

## Findings

| # | Finding | Status | Trigger | Blast radius | Severity | Fix |
|---|---|---|---|---|---|---|
| **F1** | `settledWatermarkMs` could return an instant **after `nowMs`**, contradicting its own contract header ("only ever … never past `now`"). `nat()` does not floor — it accepts any finite non-negative Number — so a fractional `grantMs < 1` makes the strict-advance floor `nowMs - (grantMs - 1)` land above `nowMs` | **CONFIRMED** by fuzz; **unreachable from today's callers** | `settledWatermarkMs({nowMs, grantMs: 0.5, capped:false}, {ticks:0}, 1, {})` -> `nowMs + 0.5`. Production `grantMs` is integer ms throughout, and `hr_apply`'s `least(now(), …)` is a second clamp | none today; a future caller with a non-integer span would pay for time that has not happened | **Low** (latent) | **DONE on the review branch**: `return Math.min(nowMs, Math.max(floorMs, nowMs - remainder));` + guard `D9` |
| **F2** | the recovered carry is smaller than advertised for active players: `hr_apply` stamps `accrued_to = now()` on any delta carrying `equip` / `activity` / `enchant`, which discards the deferred tail | CONFIRMED (source), **not a regression** — the tail was destroyed on every window before this change | equip a weapon shortly after a settle | self only, <= one tick, loss direction | Informational | none; do not restate 1.3-1.7% as a floor for players who equip/switch often |
| **F3** | a player choosing the poll instant chooses the deferred tail, so <= `tickMs - 1` of simulation can be re-priced under a later Boss-of-the-Day / buff / catalogue | PLAUSIBLE, bounded | poll at `t`, wait for a rollover, poll again | self only, sub-one-kill; the lag is **non-compounding** — the watermark becomes tick-aligned, so total lag is `(now - W0) mod tickMs` | Informational | accepted; probe P5 `maxLag=1200 ms < tick 2400 ms` over 2000 polls, P7 `max deferrable = 2399 ms` |
| **F4** | `recovering_until` is cleared against the window END (`ctx.toMs`) while the watermark lands before it, so a recovery expiring inside the tail is cleared <= one tick early | PLAUSIBLE, bounded | a knockout whose recovery ends inside the sub-tick tail | self only, < `tickMs` of a minutes-long clock; a pure-recovery window barely defers because `recoverMs` is inside `accounted` | Informational | accepted; journalled via `player_ledger` |

`deferredMs` was verified not to leave `accrual.js`: `grep -rn deferredMs` outside it matches only
the two test files. It is not a delta key, not ledger meta, and `index.ts` does not forward it.

## Would the existing tests have caught F1?

No. `settle-carry-defer.mjs` drove five realistic fixtures and three direct calls with integer
inputs; the contract header's *range* claim was asserted nowhere. **D9** now fuzzes it:
209,952 combinations of hostile `grantMs` / `tickMs` / `ticks` / `attendedToMs` / `capped` against
three properties — never past `now`, strictly advancing on every uncapped window, always finite.

## Executed evidence

| Command | Exit |
|---|---|
| `git merge --no-edit worktree-agent-a076e0726614423e6` | **0**, zero conflict hunks |
| `node tests/settle-carry-defer.mjs` (as handed over) | **0** |
| `node tests/settle-carry-defer.mjs --mutate` (as handed over) | **0** — 5/5 caught |
| adversarial probe P1-P8 (scratchpad) | P4 fuzz **RED**, one violation class -> F1; P1/P2/P3/P5/P6/P7/P8 ok |
| `node tests/settle-carry-defer.mjs` with D9, **clamp mutated away** | **1** — `D9a … e.g. {"g":0.5,"st":1,"tk":0,"at":0,"capped":false,"over":0.5}` |
| `node tests/settle-carry-defer.mjs` with D9 + clamp restored | **0** — D9a 209,952 combinations, D9b, D9c |
| `node tests/settle-carry-defer.mjs --mutate` after the fix | **0** — 5/5 still caught |
| `node tests/live-settlement.mjs` | **0** |
| `node tests/settle-carry-loss.mjs --mutate` | **0** |

## Residual risk accepted

1. **F3 and F4**: a bounded, self-only, sub-one-tick timing benefit, non-compounding and journalled.
   Re-open if `tickMs` ever approaches `ACCRUE_MIN_MS` (60,000 ms) — no catalogue row is near it
   today, and probe P1 shows the degradation at `tickMs > grantMs` is a 1 ms/poll crawl that
   `capped` heals, not a freeze and not a mint.
2. `settle-carry-defer.mjs` (both arms, now including D9) lives in `tools/lane-done.mjs`, not in
   `.github/workflows/smoke.yml`. Same standing debt as `no-new-prediction.mjs`; Coordinator's file.
3. `hr_engine` remains trusted to propose a legal watermark, as the section above already records.
   The deferral does not widen that trust: the value is still clamped twice, in the engine and
   again in `hr_apply`.

---

## 2026-09-17 — Security review: `2026-09-17-attended-xp-on-settle.sql` (lane C, NOT APPLIED)

Verdict: **GO-WITH-CHANGES**. The server half is sound; the blocking condition is
client-side and belongs to the systems-engineer lane, not to this file.

### What was executed
| Command | Exit / result |
|---|---|
| `node tests/live-settlement.mjs --mutate` | 0 — 11/11 caught incl. `topup-pays-on-top` |
| `node tests/schema-drift.mjs` | 0 — rebuilds to `676a62498631…` |
| `node tests/patch-chain-guard.mjs` | 0 — **green**, ACK recognised; `hr_credit_combat_xp__ungated` carried on the slice-7 list |
| `node tests/restore-census.mjs` | 0 — no new table; pre-existing 3-row ledger residue unchanged |
| `node tools/lane-done.mjs` | 0 — all green |
| live read-only grant probe (prod) | `player_state`: SELECT-only to `authenticated`, one SELECT policy, no UPDATE/INSERT/ALL; `hr_apply` and `hr_credit_combat_xp__ungated` execute = false for anon/authenticated/service_role; `combat_settle_span` absent (file genuinely unapplied) |

### Findings
| # | Surface | Status | Blast radius | Severity |
|---|---|---|---|---|
| S-1 | b548 client drops the deferred XP on `accrued` (`src/net/accrue.js:469-474`, `:587-589`); the migration requires a **re-send** after the settle. The span is stamped and never claimed. | CONFIRMED (code read) | self only, under-pay — the P1 is **not fixed** by applying this alone | P1 efficacy, not security |
| S-2 | The physical cap is linear with no constant term; `cap(1h)` = 16.7M–29.9M XP vs the 5M/day combat ceiling (reached in 10–18 min of elapsed on the **ordinary** path too). The top-up adds no new ceiling — the day budget is and remains the only binding anti-forgery bound. | CONFIRMED (cap body + arithmetic) | pre-existing residual, unchanged | accepted |
| S-3 | `GATE(d)` proves single-consumption **sequentially**, not under concurrency; the guarantee rests on `pg_advisory_xact_lock` + `for update` (`GATE(R4)`). | PLAUSIBLE-closed | none observed | accepted |
| S-4 | A second settle whose span is <=180 s NULLs a live stamp, silently disabling the top-up for that window. | CONFIRMED | under-pay only | accepted |

Closed with evidence: client-forged span (grants + `GATE(b)` + live probe), direct
`hr_apply` call (revoked, live-verified), span replay / second idem key
(`GATE(d)`/`(e)`), reach-past-span (`v_span_to = v_accrued`, `GATE(f)`), mid-span
activity switch (every non-accrual `hr_apply` delta NULLs the stamp, `GATE(i3)`),
inflated `p_delta.xp` (engine-authored, and it only ever *subtracts*),
projection leak (`hr_state_of` is an explicit `jsonb_build_object`; zero
references to the column anywhere under `src/**`).

### Conditions of the GO
1. **The client re-flush (S-1) lands before or with the apply.** A confirmed
   settle must re-submit the deferred snapshot inside the 120 s grace instead of
   dropping it, with a smoke test that fails without it. Applying this migration
   without it installs a dormant patch on a money function for zero player gain.
2. **Restatement (item 12): do NOT restate from the repo before apply.** A
   repo-authored restatement of a 7-deep live body is the b484 class and already
   dropped the recovery floor once on this exact function (2026-09-09). The ACK
   plus the eight `GATE(R*)` re-reads of the INSTALLED text is the correct
   bounded control. The Coordinator's obligation instead: capture
   `pg_get_functiondef` of `hr_apply` and `hr_credit_combat_xp__ungated`
   **immediately before and immediately after** the apply, diff them, confirm the
   only delta is the five splices, then `live-hash-drift --live --write`. The
   paydown restatement is authored FROM that captured live text, in its own lane.

---

## 2026-09-18 — adversarial review: the caller taxonomy + `meta.w` (GO-WITH-CHANGES, changes landed)

Subject: `finalWindow: boolean` → `caller: 'accrue'|'collect'|'tick'`
(`accrualCaller`, `supabase/functions/hr-accrue/accrual.js`), and one journal
meta key `w = "<recoverMs>,<idleMs>"`. No SQL, no RPC body, no grant, no new
delta key; `caller` is never forwarded to `hr_apply`.

**Why this needed a review at all.** `caller` is the first input to the accrual
engine that decides a PRIVILEGE rather than a quantity. `'collect'` and `'tick'`
each lift `ACCRUE_MIN_MS` (a 5 s window becomes payable), and `'collect'`
additionally stamps the watermark at `now()` instead of deferring. A client that
could name its own caller would poll at 1 Hz and be priced every time.

### What the author shipped, and where it stopped short
The two production call sites are quoted literals and A14b asserts that. Two
gaps, both about what the guard CANNOT see:

1. **A14b enumerates two filenames.** A third edge call site — a future intent
   handler, a new verb's module — spelling `caller: body.caller` is invisible to
   A14 and A14b alike, because a source regex cannot read a file that did not
   exist when it was written. The privilege was defended by convention at every
   call site not yet written.
2. **A14b asserted `lits.length === 1`, never the VALUE.** Swapping `index.ts`
   to `caller: 'collect'` passed it. That swap is precisely the defect the arm's
   own comment describes.

### The three changes made on this branch (all mutation-proven)
* **A runtime fence, not only a source one.** `accrualCaller` honours
  `'collect'`/`'tick'` only against `CALLER_AUTHORITY`, a module-private frozen
  object IDENTITY held by `import`. A request body is JSON and cannot express
  object identity: `JSON.parse(JSON.stringify(CALLER_AUTHORITY))` is refused.
  Every present and future body-borne caller therefore reads as `'accrue'` —
  floor on, remainder deferred, the conservative direction. Proof:
  `tests/settle-carry-defer.mjs` D4g (five forgeries × two privileges, plus a
  non-vacuity arm). Deleting the identity check turns eleven D4g arms red
  (observed: exit 1).
* **`'tick'` cannot ship in the edge payload.** `tickCallerProblems` /
  `tickCallerGuard` in `tools/pack-edge.mjs`, wired into `runAll` and `--check`,
  so it bites at PACK time — the last point where "what ships" is a readable
  list of files. `'tick'` belongs to `services/world-tick`, a loop the SERVER
  clocks; on a handler a client calls, the cadence is the attacker's. Proof:
  `tests/activity-intent.mjs` A14c, selftest plus the live tree.
* **A14b now pins the caller per file** (`index.ts` → `accrue`,
  `set-activity.js` → `collect`) with the consequence of each swap named in the
  message. Proof: mutating `index.ts` to `'collect'` → `activity-intent` exit 1
  on that assertion.

### Executed evidence for the questions asked
| # | Question | Result |
|---|---|---|
| 1 | can a request field reach `caller`? | **No.** Three `computeAccrual` call sites exist (`index.ts`, `set-activity.js`, `services/world-tick/shadow.js` — undeployed); each builds a literal with no spread of the body. Now also fenced at runtime. |
| 2 | can shipped code label itself `'tick'`? | **No**, and it now cannot become able to: `pack-edge` refuses a payload containing `caller: 'tick'`. |
| 3 | does the b531 reason for `'collect'` hold? | **Yes** — `set-activity.js` stamps `active_since = now()` after the collect, so the window is destroyed rather than deferred. Mislabelling is now caught by a named assertion (the A14b per-file pin). |
| 4 | can hammering 1 s accrues mint time? | **No.** 1,800 polls at 1 Hz over 30 min: 30 accepted, `paid = 1,800,000 ms` = exactly wall time. A single 30 min window pays the identical 1,800,000 ms. Even holding the REAL authority, `'collect'` at 1 Hz accepts 600 windows and still pays exactly wall time — the privilege buys ROWS, never TIME. |
| 5 | does `meta.w` disclose anything? | **No.** Two integers the player's own simulation already produced (`recoverMs`, `idleMs`), on the player's own RLS-scoped ledger row, less precise than the `from`/`to` already on it. No seed term, no other player, no clock beyond `created_at`. The ten-key allowlist (`ms ticks kills capped ate att spent w from to`) admits no free text: `spent` is server catalogue ids, `att` is nested integers, `w` is two `Math.floor`ed integers. |
| 6 | ledger size | **Row-neutral** — `w` rides an existing row and is omitted when both terms are zero. ≤ 24 B on affected rows against the runbook's 215 B/row measurement. `hr_ledger_prune`'s ceiling is a ROW-count budget and is untouched. |

### Residual risks accepted
* An author who deliberately imports `CALLER_AUTHORITY` and wires a body field
  to it defeats the fence. No in-process check can stop that; A14b + A14c make
  it a visible, deliberate act rather than an accident.
* `services/world-tick/shadow.js` keeps `caller: o.caller || 'tick'` so the
  parity suite can drive the `'collect'` mutant. It is not deployed; when the
  tick service ships, that override is removed or gated.
* `'collect'` is reachable by activity-switch spam and can write many small
  ledger rows (600 per 30 min measured with nothing in front of the engine).
  Bounded today by `deltaHasValue` (a no-value window writes nothing) and by
  `hr_rate_gate` on the intent; the runbook's 800 rows/character/day budget at
  100× is the thing to watch — not a new risk from this change.

**Verdict: GO-WITH-CHANGES — the changes are on this branch.** Guards, exit
codes observed: `settle-carry-defer --mutate` 0, `world-tick-parity --mutate` 0,
`accrual-engine --mutate` 0, `activity-intent` 0, `live-settlement` 0,
`pack-edge hr-accrue --hash` 0, `lane-done` 0.

---

## 2026-09-18 — Ledger rollup currencies + retired IAP catalogue removal (branch `rel-census-ledger-b550`)

Adversarial review of two staged, unapplied migrations. Evidence is executed:
read-only SELECTs against production `nezapsylztqbbwuwembx` through the
management endpoint (token as file bytes, never printed), plus the PGlite chain
replay in `tests/ledger-rollup.mjs`.

**Doc size note (measured after the merge with the caller-taxonomy review):
this file is 574 lines carrying four dated reviews, and tonight it produced a
merge conflict because two Security lanes appended to the same tail on the same
day — the append-only shape is now costing integration time, which is the signal
to act on. RECOMMENDATION: at the next quiet moment, split it by SUBJECT into
one file per reviewed surface (accrual/caller-authority, ledger retention,
catalogue/DR) with this file reduced to an index of verdicts and open residual
risks. Not done here: a split during an open lane-C review would rewrite the
document the Coordinator is reading the GO out of.**

### Verdict
| Migration | Verdict |
|---|---|
| `2026-09-18-ledger-rollup-currencies.sql` | **GO-WITH-CHANGES** — changes made on this branch, below |
| `2026-09-18-retired-iap-catalogue-removal.sql` | **GO-WITH-CHANGES** — changes made on this branch, below |

### S-LR-1 (CONFIRMED, changed) — `player_ledger.xp` has no non-negative CHECK
The file summed `greatest(xp, 0)` into `xp_in` alone, justified as "xp and
gems_in are non-negative by CHECK". Measured on production, `pg_constraint` on
`public.player_ledger` holds `player_ledger_gems_in_nonneg` (on `gems_in`, real)
and `player_ledger_inflow_nonneg` (on `gold_in`/`xp_in`/`qty_in`). **`xp` — the
signed movement column this rollup actually summarises — is unconstrained.** The
clamp is therefore unguarded: the first XP debit the game ever issues (respec,
rollback, anti-cheat clawback) would be deleted by the prune with the only
surviving record silently reading zero, on a RANKED surface. Zero negative-`xp`
rows exist today; 329 negative-`qty` rows do, which is why `qty` correctly got a
pair. Fixed: `xp_out` column + derivation + `on conflict` accumulation, self-check
`e1` (5 cols) / `e6b` / `e12`, a negative-xp probe row (`probe_c`), and `e1b`,
which fails loudly if someone later ADDS the CHECK and makes `xp_out` provably
dead. Guard: `ROLLUP_SUMS.xp_out`, a negative-xp fixture row, and the
`clamp_xp_debit` mutant.

### S-LR-2 (changed) — the rollup's columns now carry their provenance
`player_ledger` has both a movement and a same-named budget column for gold, xp
and qty. `rollup.xp_in` derives from `ledger.xp`; `rollup.gems_in` derives from
`ledger.gems_in`. Two conventions, one naming scheme, on the only artefact that
outlives the detail — whose sole reader is a human doing forensics with no rows
left to check the meaning against. Not renamed (that would move a shipped
column); documented IN the database by `§1b` `comment on column`, asserted by
`e1c`.

### S-LR-3 (CONFIRMED, NOT fixed here — owner: Backend Architect, due before ~2026-11-21)
**Property (4) of `tests/ledger-rollup.mjs` is not a detector.** It re-issues the
per-day predicates the author believed were the only readers, so it can only
confirm the list it was given. Run against the real bodies, that list was
incomplete. Three live read sites query `player_ledger` with **no time predicate
at all**, and the rollup structurally cannot rescue any of them — its key is
`(user_id, slot, month, kind)` and it carries neither `intent` nor `item_id`:

| Site | Lifetime fact | What the first prune does | Blast radius |
|---|---|---|---|
| `hr_apply` — `count(distinct item_id) … kind='hearthfind'` | trophy-set completion | a set assembled over >90 days can never complete; the earliest trophies are gone | self; destroys earned collection/title progress. Worse the RARER the collection, which is the whole point of hearthfind |
| `hr_apply` — `count(*)+1 … kind='hearthfind' and item_id=X` | global "Nth ever found" ordinal | ordinals reset and repeat: two players both announced as the Nth finder | **crosses to other players** — a shared prestige surface becomes a lie, silently and permanently |
| `hr_bounty_first_contract` — `… kind='bounty' and intent like 'bounty_turnin:%' limit 3` | the 3-turn-in beginner grace | a veteran with 90 days of bounty inactivity gets the widened kill FLOOR back | self; recurring difficulty/reward distortion |

Not blocking, because all three are pre-existing defects in *other* functions and
the currency fix strictly improves conservation. **Latent, not live:** production
holds zero `kind='hearthfind'` rows today, and the prune has never fired. The
`hr_apply` site carries the comment *"never a stored counter … would drift on any
prune"* — written by an author who assumed the ledger was permanent.

Guard added instead of a patch: **property (5), the lifetime-reader census**
(`lifetimeReaderCensus()`), which scans every `pg_proc` body in the replayed
chain, classifies each `from public.player_ledger` read site bounded/unbounded,
and fails on a FOURTH. The three known sites are pinned with owner and due date;
a *stale* pin (someone fixed one) is also red, so the pin cannot rot upward.
Mutant `a_new_lifetime_reader` proves it bites. It found its own false positive
on first run (`hr_dungeon_cooldowns` puts an 8-line rationale between its
from-clause and its `at >=`), which is why the window strips comments before
measuring rather than after.

### Checked and clean (ledger rollup)
Idempotency/crash-safety — one statement, one transaction; `doomed` is
referenced twice so it materialises once; a batch boundary splitting a
(user, day) is absorbed by `on conflict … do update set n = r.n + excluded.n`.
Unknown `kind`s cannot be dropped: `kind` is in the GROUP BY and in the PK, so
every kind rolls up whether or not anyone anticipated it (28 kinds permitted by
`player_ledger_kind_check`; 20 have rows). NULLs are coalesced (measured: 21,288
NULL `xp`, 21,580 NULL `qty`, 11,507 NULL `gems_in`, 1,250 NULL `gold`).
Privileges: `hr_ledger_prune` is EXECUTE-able by `postgres` only; cron
(`hr-ledger-prune`, `7 * * * *`) runs as `postgres`, so the `revoke … from
service_role` does not break the caller. `player_ledger_rollup` has RLS enabled
with a single `SELECT` policy `auth.uid() = user_id` — **no player can read
another player's rollup**, and the new columns inherit it. PK is
`(user_id, slot, month, kind)`. Every per-day ceiling is genuinely day-scoped
(`hr_day_budget_used`, market list/escrow/spend/proceeds, unlock-buy namespace,
gem-unlock, hero-slot, recipe, trait, dungeon scrip/count, quartermaster) —
asserted, and now also detected. Live-hash: `hr_ledger_prune` is the only body
moved.

### S-IAP-1 (CONFIRMED, changed) — §0 gate (a) refused on the wrong set
`key like 'entitlement:%'` refuses on ANY entitlement. The namespace has a THIRD
member this file KEEPS — `entitlement:hearthHall`, catalogued as
`iap.hearth_hall_premium`, repo-produced, one of the 91 that stay. A live,
correct, unrelated purchase would have blocked a DR cleanup while reporting "a
player owns one of these" about rows they do not own. Fail-closed, so not a hole
— but a gate that refuses for a reason that is not its subject is a gate people
learn to widen. Narrowed to the two target keys.

### S-IAP-2 (changed) — the gates could have been vacuous, and one version broke DR
Added `(a2)`: refuse if `player_progress`/`player_ledger` are empty, so the zeros
in (a) and (b) are real zeros rather than an artefact of pointing at nothing
(measured: 1,726 progress rows / 65 `kind='unlock'`, 22,169 ledger rows). The
first draft of that gate was unconditional and **`tests/schema-drift.mjs`
immediately went red** — a DR restore has no players by definition, so an
unconditional emptiness check turns this file into the very hole it closes. Now
scoped to "the target rows are actually present". Added `(a3)`: refuse if any
offer other than the three being deleted grants the two unlocks (measured: none
do) — `§2(d)` caught that after the fact, which is safe but late.

### Checked and clean (IAP removal) — all measured on production 2026-09-18
Ownership `entitlement:%` = **0**; ledger `unlock_buy:iap.%` or
`meta->>'unlock' like 'entitlement:%'` = **0**; `kind='iap'` ledger rows = **0**.
All three offers carry a refusal and NULL gold, so none is sellable. Counts are
exactly as the file asserts: offers 142 (`gen-unlock-offers` 94 +
`gen-gold-ladders` 48), unlocks 82. **Cascade risk: none — `pg_constraint` holds
NO foreign key anywhere whose `confrelid` is `hr_unlocks` or
`hr_unlock_offers`.** The file's §1 comment claiming an FK was corrected to say
so. `theme:forest` keeps a live referrer (`theme.forest`) and is correctly kept.
Client: no shop or unlock surface references the five ids — the only hits in
`src/**` are the b505 guards asserting their ABSENCE, plus
`src/features/smoke/bounty-and-artisan.js:2691`, which proves a **forged**
`offlinePlus`/`noAds`/`hearthHall` entitlement flag moves the offline cap by
zero. So the removal cannot produce a "client shows X, server refuses" state.

### Required apply order, and what the Coordinator does after each
1. `2026-09-18-ledger-rollup-currencies.sql` — after `2026-08-11-player-state.sql`
   (its §0 refuses otherwise). It is the new LAST TOUCHER of `hr_ledger_prune`.
   After apply: `node tests/live-hash-drift.mjs --live --write` + whys from
   `--codediff` (expect exactly one moved body, `hr_ledger_prune`); flip its
   apply-order note to APPLIED. No new table, so no census re-pin. No edge, no
   client half. **Deadline: before ~2026-11-21**, after which the detail this
   file would have summarised is already gone.
2. `2026-09-18-retired-iap-catalogue-removal.sql` — last. NO function body moves,
   so **no live-hash movement and no `--live --write` for this one**. After
   apply: `node tests/restore-census.mjs --live-sql` on prod, then
   `--live-compare` (expect offers 142→139, unlocks 82→80, red→green); flip its
   apply-order note to APPLIED. No new table to classify. No edge, no client.

Neither file has a client half, so neither needs to ride the daily cut.

### Residual risks accepted
1. **S-LR-3's three lifetime readers remain open.** Bounded (latent until the
   prune fires ~2026-11-21; zero hearthfind rows exist today), journalled (the
   census prints them on every green run), and now guarded against a fourth —
   but not closed. If they are still open on 2026-11-01, that is a P1.
2. `hr_ledger_prune` has still never executed against production data. Property
   (5) and the PGlite replay are a fire drill, not the fire. The first real run
   should be watched.
3. The IAP removal's `e5`/`e6` pin absolute counts (139/80). Any catalogue change
   applied between this review and the apply makes the file refuse — correct, and
   it means the file must be re-measured, not edited, if that happens.
